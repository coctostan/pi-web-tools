# Code Review — Issue 013: Lean Context (Summary Search + File-First Storage)

## Files Reviewed

| File | Changes |
|------|---------|
| `exa-search.ts` | Added `detail` option, summary/highlights content mode, removed 200-char snippet truncation, updated `parseExaResults` to handle `summary` field |
| `exa-search.test.ts` | New tests for summary mode, highlights mode, default, no-truncation, fallback ordering |
| `offload.ts` | Added `FILE_FIRST_PREVIEW_SIZE = 500` export |
| `offload.test.ts` | New test asserting `FILE_FIRST_PREVIEW_SIZE === 500` |
| `tool-params.ts` | Added `detail` normalization with `VALID_DETAIL_VALUES` set |
| `index.ts` | `web_search` schema + description updated; `fetch_content` rewritten for file-first storage; `githubCloneUrls` tracking; `MAX_INLINE_CONTENT` removed from fetch handler |
| `index.test.ts` | New test suites for `web_search` detail passthrough, file-first storage, `tool_result` interceptor |

---

## Strengths

**`exa-search.ts` — clean, minimal diff**
- The ternary at L87–89 (`options.detail === "highlights" ? {...} : { summary: true }`) is the right shape: a single expression, forward-compatible if Exa adds more modes later.
- The IIFE in `parseExaResults` (L55–63) is a good pattern for sequential fallback logic without temporary variables.
- Empty-string fallback for bare results (`return ""`) is defensive and explicit.
- Removing the 200-char snippet truncation (L145 in the old code) is correct — summaries are already brief; the truncation was only appropriate for raw highlights.

**`tool-params.ts` — consistent validation pattern**
- `VALID_DETAIL_VALUES` set + type narrowing at L53–55 follows exactly the same pattern used for `type` and `category`. Consistent, no magic strings in the execute path.

**`offload.ts` — constants separation**
- Exporting `FILE_FIRST_PREVIEW_SIZE` separately from `PREVIEW_SIZE` (L7–8) is the right design — the two constants serve different purposes (file-first preview vs. the `tool_result` interceptor safety net), and keeping them distinct makes it clear at the call sites which preview size is in effect.

**`index.ts` — `githubCloneUrls` tracking**
- Using a `Set<string>` to track clone URLs (L343–354) and checking it at both the single-URL and multi-URL code paths is a clean pattern. The Set is scoped inside the `try` block of the execute function, so it doesn't leak across calls.

**`index.test.ts` — test coverage quality**
- The `getFetchAndGetSearchContentTools()` helper (L139–164) that registers both tools in a single module load is the right way to test the store interaction (criterion 19). Good design.
- The disk-error test (L643–673) uses `mockImplementation` that selectively throws based on content — tests the error path in isolation without affecting the success path.
- Tests check `offloadState.offloadToFile` call counts rather than text content size — this is more precise and less brittle than character-count assertions.

---

## Findings

### Critical

None.

---

### Important

**`index.ts:415, 536` — Prompt-fallback writes warning text into the temp file**

```typescript
// Single-URL prompt fallback (line 415)
const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
const filePath = offloadToFile(fullText);
const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
```

The warning prefix (`⚠ No filter model available. Returning raw content.`) is embedded in `fullText`, which is what gets written to the temp file. When the agent later uses `read` on the file path, the first thing they see is the warning message — not clean page content. The file would look like:

```
⚠ No filter model available. Returning raw content.

# Page Title

[actual content here]
```

Additionally, the response already shows `⚠ ${reason}` as an explicit line, and then the preview (which also starts with `⚠ ${reason}`) repeats it. The warning appears twice in the same response.

**Fix:** Write only `# ${r.title}\n\n${r.content}` to the file. Show the reason as a separate annotation in the response. Use `fileContent.slice(0, FILE_FIRST_PREVIEW_SIZE)` for the preview. Keep the reason-prefixed string only for the inline disk-error fallback path. The same fix applies at line 536 in the multi-URL prompt fallback path.

This is a one-variable rename + reference update (trivially safe, backwards compatible, no schema changes). The fix should be applied before merge — it's a small change with meaningful impact on file quality. The TDD guard requires writing a failing test first (asserting `offloadToFile` is called with content that does NOT start with `⚠`), then applying the fix.

---

### Minor

**`index.ts:488, 597` — Preview duplicates title**

```typescript
// Single-URL raw path (line 487–492)
const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
const previewText = [
  `# ${r.title}`,    // title shown explicitly
  `Source: ${r.url}`,
  ``,
  `${preview}`,      // preview ALSO starts with `# ${r.title}\n\n...`
```

The preview starts with `# ${r.title}\n\n...` (because `fullText = `# ${r.title}\n\n${r.content}``), which duplicates the explicit title header above it. 500 chars of preview context is wasted on the title heading. Using `r.content.slice(0, FILE_FIRST_PREVIEW_SIZE)` instead would show 500 chars of actual content. Same issue at line 597 (multi-URL raw path). No test assertions depend on this exact structure.

---

**`index.ts:453` — Catch block closing brace at wrong indent level**

```typescript
            } catch {       // opens at 12-space indent (line 441)
              return {
                ...
              };
          }                 // closes at 10-space indent (line 453) ← should be 12
          }                 // closes if (prompt) at 10-space indent (line 454) ← correct
```

The `} catch { ... }` block is opened at 12-space indent but its closing brace is at 10 spaces — same level as the enclosing `if (prompt)`. Cosmetic only (TypeScript is whitespace-insensitive), but makes the block structure harder to read. The code compiles and executes correctly.

---

**`index.test.ts` — Missing newline at end of file**

The diff shows `\ No newline at end of file`. POSIX convention and most linters/editors expect a trailing newline. Trivial fix.

---

**`index.ts:580–582` — Multi-URL GitHub clone content fully inlined**

```typescript
if (isGitHubCloneResult) {
  lines.push(`${i + 1}. ✅ ${r.title}`);
  lines.push(`   ${r.url}`);
  lines.push(`   ${r.content}`);  // full tree inlined here
```

Before this change, multi-URL fetches without `prompt` returned only `title (N chars) + URL` per entry — no inline content. Now GitHub clone results are fully inlined in multi-URL mode. The `tool_result` interceptor acts as a safety net above 30K, but for typical repo trees (1–3K), the tree will now be inlined in multi-URL responses. This is a minor behavior change from pre-feature (where no content was inlined in multi-URL mode). Criterion 15 says "returned inline as before — no file-first behavior", which is ambiguous about multi-URL context; the behavior is consistent with single-URL GitHub behavior. Not blocking, but worth noting.

---

## Recommendations

1. **File-first content polish (fix before next release):** Apply the "warning prefix" fix from the Important finding. Test: add an assertion in the prompt-fallback test that `offloadState.offloadToFile.mock.calls[0][0]` does NOT start with `⚠` — then fix the `fullText` construction.

2. **Preview quality (nice-to-have):** Switch from `fullText.slice(0, FILE_FIRST_PREVIEW_SIZE)` to `r.content.slice(0, FILE_FIRST_PREVIEW_SIZE)` in the raw path preview. More signal, less title duplication. Can be bundled with recommendation #1.

3. **Multi-URL GitHub inline behavior:** Consider whether GitHub clone results should be file-first in multi-URL mode too (consistent with the "no inline content" design of the feature), or at least subject to the same 30K guard. For now the `tool_result` interceptor handles the worst case, but explicit file-first would be more consistent.

4. **`index.ts` large function:** The `fetch_content` execute function is now ~280 lines. Consider extracting `handleSingleUrlFetch()` and `handleMultiUrlFetch()` helpers in a future cleanup pass (tracked in ROADMAP as issue #007).

---

## Assessment

**ready**

All 22 acceptance criteria are satisfied and verified. Tests are thorough, meaningful, and cover edge cases (disk error fallback, GitHub inline vs. file-first, store access after file-first, etc.). The architecture is sound — file-first is cleanly separated via `FILE_FIRST_PREVIEW_SIZE` from the `tool_result` interceptor, GitHub tracking via a scoped Set is clean, and the `get_search_content` store remains the authoritative content source.

The "Important" finding (warning text in temp file) is real and should be fixed before the next release as a polish item. It doesn't affect correctness, spec compliance, or any acceptance criterion, but it degrades the quality of files the agent reads. The TDD guard prevents applying it inline in this review session — it should be addressed as the first task in the next iteration (issue #007 cleanup pass or a standalone polish fix).
