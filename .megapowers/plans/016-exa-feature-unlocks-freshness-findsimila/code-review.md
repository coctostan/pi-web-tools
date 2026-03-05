# Code Review — 016-exa-feature-unlocks-freshness-findsimila

## Files Reviewed

| File | Changes |
|------|---------|
| `exa-search.ts` | Added `maxAgeHours` to `ExaSearchOptions`; added `EXA_FIND_SIMILAR_URL` constant; added `maxAgeHours` to `searchExa` request body (conditional); new `findSimilarExa()` function |
| `tool-params.ts` | Added `FRESHNESS_MAP` constant; added `freshness` and `similarUrl` params to `normalizeWebSearchInput`; updated validation logic and return type |
| `index.ts` | Imports `findSimilarExa`; added `freshness`/`similarUrl` to `WebSearchParams` schema; routing logic in `execute` (`if (similarUrl)` / `else`); updated `renderCall` for `similarUrl` display; **fixed** `queryCount` bug |
| `exa-search.test.ts` | 2 new tests for `maxAgeHours` in `searchExa`; new `findSimilarExa` describe with 3 happy-path tests + **3 error-path tests added during review** |
| `tool-params.test.ts` | 9 new tests covering all freshness enum values and `similarUrl` validation |
| `index.test.ts` | 2 routing tests for `similarUrl` vs `query`; **1 test added during review** for `queryCount` correctness |

---

## Strengths

- **Clean separation of concerns** — `normalizeWebSearchInput` handles validation/mapping, `exa-search.ts` owns HTTP concerns, `index.ts` wires them together. New params follow exactly the same pattern.
- **`maxAgeHours: 0` handled correctly** — `tool-params.ts:63` uses `params.freshness in FRESHNESS_MAP` (not value truthiness), so `realtime → 0` is preserved through the chain; `searchExa` guards with `!== undefined`, not falsiness (`exa-search.ts:109`). No off-by-one on the "realtime" case.
- **`findSimilarExa` matches `searchExa` structure exactly** — same abort signal composition, same retry via `retryFetch`, same `parseExaResults` parser, same API key guard. Consistent and readable.
- **`renderCall` updated** — `index.ts:313-320` branches on `similarUrl` to show `similar: <url>` instead of a quoted query. Good UX detail.
- **Spec-compliant mutual exclusion** — `similarUrl` + `query` throws with `/mutually exclusive/i`; neither provided throws with the original message. Error messages match spec criteria 9 and 10 exactly.
- **Test quality** — tests inspect actual fetch call bodies (`JSON.parse(mockFetch.mock.calls[0][1].body)`), not just that functions were called. The routing tests in `index.test.ts` assert both positive and negative (e.g., `expect(searchExa).not.toHaveBeenCalled()`).

---

## Findings

### Critical
None.

### Important

**1. `queryCount: 0` when `similarUrl` is used — `index.ts:300` (pre-fix)**

`queryCount: queryList.length` was 0 when `similarUrl` was used (because `queryList = []` in that branch). The `renderResult` function at `index.ts:345-350` reads this field to display:
```
`${successCount}/${totalCount} queries succeeded, ${resultCount} sources`
```
This produced `"1/0 queries succeeded, N sources"` — an impossible fraction that would confuse users in the TUI.

**Fix applied:** Changed to `queryCount: similarUrl ? 1 : queryList.length`. A failing test was written first (`returns queryCount 1 (not 0) when similarUrl is used` in `index.test.ts`), then the production fix. 186/186 tests pass.

**2. `findSimilarExa` error paths untested — `exa-search.test.ts:469` (pre-fix)**

The original `findSimilarExa` describe had 3 tests covering only the happy path. The null-API-key guard (`if (options.apiKey === null)` at `exa-search.ts:143`), the fetch-rejection path, and the non-ok HTTP response were all untested, even though the same paths are covered for `searchExa`.

**Fix applied:** Added `describe("findSimilarExa error paths", ...)` with 3 tests:
- `throws when apiKey is null` — verifies both "EXA_API_KEY" and "web-tools.json" in message
- `throws when fetch fails with a network error` — asserts wrapped error message with url
- `throws on non-ok HTTP response with status code` — asserts "401" in message, uses fake timers for retries

All 3 passed immediately, confirming the production code was already correct. Total test count: 182 → 186.

### Minor

**3. Missing trailing newline in `index.test.ts` (pre-fix)**

The file ended without a final `\n`. Fixed with `printf '\n' >> index.test.ts`.

**4. `## Query:` label is semantically off for `similarUrl` results — `index.ts:287`**

The output section header uses `## Query: ${r.query}` for all results. When `r.query` is set to `similarUrl` (a URL string), the header reads `## Query: https://example.com` — awkward since there was no query. A label like `## Similar to:` would be clearer.

Not fixed — cosmetic only and would require branching the stored result data structure. Noted for a follow-up.

---

## Recommendations

1. **`FRESHNESS_MAP` with `undefined` values** — `tool-params.ts:11`. Using `undefined` as a map value works correctly here (the `in` guard distinguishes "key exists with undefined" from "key missing"), but it's a subtle pattern. A comment or using `null` as the sentinel for "omit" would make the intent more explicit. Not a bug.

2. **`findSimilarExa` code duplication** — The function duplicates ~40 lines of `searchExa` (signal setup, retry fetch, error handling, parse). With only two call sites this is acceptable YAGNI. If a third endpoint is added (e.g., `/contents`), extract a shared `exaPost(url, body, options)` helper.

3. **No URL validation for `similarUrl`** — `tool-params.ts:30` accepts any non-empty string. Consistent with how `query` is handled (no sanitization), but worth noting for future hardening.

---

## Assessment: ready

All 16 spec criteria verified. Two issues found and fixed during review:
- `queryCount` bug (Important — visible UX defect in TUI `renderResult`)
- Missing `findSimilarExa` error-path tests (Important — coverage gap for a new public function)

Post-fix: **186/186 tests pass**, 0 regressions against the 182-test pre-review baseline.
