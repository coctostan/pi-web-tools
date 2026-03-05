# Feature: Lean Context — Summary Search + File-First Storage

**Issue:** 013 (batch: #002 + #003)
**Branch:** feat/013-lean-context-summary-search-file-first-s
**Roadmap:** 2.0.2 + 2.0.3

---

## Problem

Two sources of context bloat in `web_search` and `fetch_content`:

1. **`web_search` over-fetches:** Exa highlights mode returns 3 sentences × 3 per URL = 5–15K tokens per search. Most of this content is discarded — the agent only needs enough to decide whether to dig deeper into a URL.

2. **`fetch_content` inlines too much:** Raw fetches (without `prompt`) used a 30K inline threshold. Content up to that limit appeared directly in the LLM context, consuming tokens whether the agent needed it or not.

---

## Solution

### Part 1: Lean Search (Issue #002)

Switch `web_search` to Exa summary mode by default. Each result is now a title + URL + 1-line summary (~1–2K total tokens vs. 5–15K before). When the agent needs more context for a specific URL, it can:
- Pass `detail: "highlights"` to get the original 3-sentence highlights per result
- Call `fetch_content` with `prompt` to get a focused filtered answer

**Changes:**
- `exa-search.ts`: `searchExa()` now sends `contents: { summary: true }` by default; `contents: { highlights: ... }` when `detail: "highlights"` is passed.
- `exa-search.ts`: `parseExaResults()` now checks the `summary` field first in its fallback chain: `summary → highlights → text → ""`.
- `exa-search.ts`: `formatSearchResults()` no longer truncates snippets to 200 chars (summaries are already brief; truncation was only needed for raw highlights).
- `tool-params.ts`: `normalizeWebSearchInput()` now accepts and validates a `detail` parameter (`"summary"` | `"highlights"`).
- `index.ts`: `WebSearchParams` schema includes the `detail` optional union literal; the execute handler passes it through to `searchExa()`.
- `index.ts`: `web_search` description updated to mention summary-default and `detail: "highlights"` opt-in.

### Part 2: File-First Storage (Issue #003)

All raw `fetch_content` responses now go to temp files instead of inline. The agent sees a 500-char preview + file path, then uses the `read` tool to explore selectively. This eliminates the 30K inline dump entirely.

**Paths affected:**
- **Single URL, no `prompt`:** Content written to temp file; response = title + source + 500-char preview + path.
- **Multi-URL, no `prompt`:** Each URL written to its own temp file; response is a numbered list with per-URL previews + paths.
- **`prompt` + filter success:** Filtered answer returned inline (~200-1000 chars). No file written. Unchanged.
- **`prompt` + filter failure (no model / API error):** Full content written to temp file; response shows warning + preview + path instead of inlining up to 30K.
- **GitHub clone results:** Returned inline as before. File-first does not apply to directory trees.

**Changes:**
- `offload.ts`: New `FILE_FIRST_PREVIEW_SIZE = 500` export, separate from the existing `PREVIEW_SIZE = 2000` (used by the `tool_result` interceptor safety net).
- `index.ts`: `fetch_content` execute handler refactored — `MAX_INLINE_CONTENT` removed from raw/fallback paths. `offloadToFile()` now called for all non-GitHub, non-filtered-success responses. GitHub clone URLs tracked via a scoped `Set<string>` (`githubCloneUrls`) populated at fetch time.
- `index.ts`: `fetch_content` description updated to mention file-first and `read`.
- Disk-write failures are handled gracefully: a try/catch around `offloadToFile()` returns inline content with a `⚠ Could not write temp file` warning instead of crashing.
- Full content continues to be stored in the in-memory store regardless of file-first, so `get_search_content` still works.
- Temp files are tracked in `offload.ts`'s `trackedFiles` Set and cleaned up on session shutdown via `cleanupTempFiles()`.
- The `tool_result` interceptor (safety net for `code_search`, `get_search_content`) remains unchanged.

---

## Files Changed

| File | Change |
|------|--------|
| `exa-search.ts` | Summary mode, fallback chain, remove 200-char truncation |
| `exa-search.test.ts` | New tests for summary/highlights/default/no-truncation/fallback |
| `offload.ts` | `FILE_FIRST_PREVIEW_SIZE = 500` |
| `offload.test.ts` | Test for new constant |
| `tool-params.ts` | `detail` normalization with `VALID_DETAIL_VALUES` |
| `index.ts` | Schema, description, file-first storage logic, GitHub tracking |
| `index.test.ts` | New test suites for `web_search` detail, file-first, interceptor |

---

## Test Coverage

138 tests, 12 test files. New tests added for:
- `searchExa` summary/highlights/default mode
- `parseExaResults` fallback ordering (summary → highlights → text → "")
- `formatSearchResults` no-truncation of long summaries
- `web_search` schema `detail` enum
- `web_search` `detail` passthrough to `searchExa`
- `fetch_content` single-URL file-first (raw and prompt-fallback)
- `fetch_content` multi-URL file-first
- `fetch_content` GitHub clone inline preservation
- `fetch_content` disk-error fallback (inline with warning)
- `get_search_content` still reads from in-memory store after file-first
- `tool_result` interceptor unchanged behavior

---

## Known Follow-ups

- **Warning text in prompt-fallback files:** The `fullText` written to temp files in the prompt-fallback path currently includes the `⚠ ${reason}` prefix. When the agent reads the file, they see the warning as the first line. Fix: write only `# title\n\ncontent` to the file; show the reason only in the response text. (Code-review finding, tracked for the next polish pass.)
- **Multi-URL GitHub inline:** In multi-URL mode, GitHub clone trees are now inlined as full content where previously they appeared as a summary line. The `tool_result` interceptor handles worst-case sizes, but explicit file-first for large trees may be preferable in a future iteration.
