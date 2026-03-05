# Code Review — 015-caching-cleanup

## Files Reviewed

| File | Changes |
|------|---------|
| `constants.ts` | New file — exports `HTTP_FETCH_TIMEOUT_MS` and `URL_CACHE_TTL_MS` |
| `extract.ts` | Added URL cache (`urlCache` Map + `clearUrlCache`); replaced raw `30000` literals with constants |
| `github-extract.ts` | Full async conversion — all sync `fs` calls replaced with `fs.promises` equivalents |
| `index.ts` | Removed `sessionActive` dead variable; imported and called `clearUrlCache()` in `handleSessionStart` |
| `todo.md` | Deleted |

---

## Strengths

- **`constants.ts` is minimal and correct** — `30_000` and `30 * 60 * 1_000` are self-documenting numeric literals; no magic needed.

- **Cache placement in `extractContent` is correct** (`extract.ts` L238–260): cache is checked before any network I/O, successful results from both the primary HTTP path and the Jina fallback path are cached, and error results are intentionally not cached (recoverable errors and non-recoverable errors both bypass the cache write). This matches the spec precisely.

- **`isBinaryFile` async conversion** (`github-extract.ts` L226–245): The consolidated try-catch-finally with `await fileHandle?.close()` correctly handles all paths — `open` failure leaves `fileHandle` null (no-op close), early `return true` still closes the handle via `finally`, and the `catch { return false }` path also closes it. Correct.

- **`execClone` restructuring** (`github-extract.ts` L161–195): Moving the cleanup-on-failure after the awaited Promise (instead of inside the callback) is cleaner and equivalent. The cleanup call is still inside a try/catch to ignore errors.

- **`clearCloneCache` fire-and-forget** (`github-extract.ts` L543–548): `rm(...).catch(() => {})` is the right pattern for a sync-signature cleanup function that can't `await`. Prevents unhandled promise rejections while not blocking the caller.

- **Session integration** (`index.ts` L47–55): `clearUrlCache()` is called in `handleSessionStart`, which handles all four session events (`session_start`, `session_switch`, `session_fork`, `session_tree`) — all bases covered.

- **Tests are meaningful**: Cache tests in `extract.test.ts` use `vi.spyOn(Date, "now")` for TTL verification (not a sleep), give the mock a distinct URL per test to avoid cross-test cache bleed, and the `index.test.ts` test verifies the wiring at integration level.

---

## Findings

### Critical
None.

### Important
None.

### Minor

**1. Blank-line removal in `extractContent` reduces visual grouping** (`extract.ts` L227–265)

The diff removed three blank-line separators that had previously delimited the function's four logical phases: (1) abort guard, (2) URL validation, (3) cache check + HTTP attempt, (4) Jina fallback. Without them, the phases flow together without visual pause. The code is still correct — this is a readability nit.

*Suggestion:* Restore the blank line between the abort check and the `// Validate URL` comment, and between the close of the try/catch and `// Try Jina fallback`.

---

**2. Three explanatory comments removed from `parseGitHubUrl`** (`github-extract.ts` L82–105)

The async conversion removed these inline comments that had nothing to do with async:
- `"// Check for non-code segments at position 2"`
- `"// Root URL: /owner/repo"`
- `"// blob/tree requires at least a ref segment"`

These are not critical (the code is still readable), but the comments helped a reader follow the URL segment-counting logic without mentally re-parsing the conditionals. Their removal is unrelated to the task and is a minor maintainability regression.

---

**3. Behavioral change in `readReadme` — improvement, but undocumented** (`github-extract.ts` L331–346)

Original: if `readFileSync` threw after `existsSync` returned true, the function returned `null` (stopped trying candidates).
New: if `readFile` throws after `access` succeeds (e.g., TOCTOU race, encoding error), the `catch { continue }` tries the next candidate.

This is strictly better behaviour, but it is a behaviour change. No concern for correctness — just worth noting it was changed.

---

**4. Pre-existing TypeScript type errors (not introduced by this PR)**

`npx tsc --noEmit` reports errors in `index.ts` (`.isError` on `AgentToolResult`, `.reason` on `FilterResult`) and a missing declaration for `turndown`. All of these exist identically on `main` — confirmed via `git show main:index.ts | grep "isError"`. This PR does not introduce or worsen them. They should be addressed in a separate cleanup issue.

---

## Recommendations

- The blank lines (finding #1) are a 2-line fix worth doing before merge for long-term readability, but not a blocker.
- Open a small follow-up issue to restore the `parseGitHubUrl` comments (finding #2) and address the pre-existing TS errors (finding #4).

---

## Assessment

**ready**

The implementation is correct and well-structured. The cache logic handles all edge cases (TTL expiry, cache invalidation on session start, error non-caching). The async `fs` conversion in `github-extract.ts` is mechanical but thorough, with no missed `await` calls. All 167 tests pass. The four findings are style nits and a pre-existing type issue — none block merge.
