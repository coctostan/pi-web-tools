# Code Review — Issue 017

## Verdict: APPROVE

## Summary

Four tasks implemented cleanly across 5 files. All 198 tests pass. No regressions.

---

## Task 1: `exa-search.ts` — Add `"keyword"` to type union

**Change:** `type?` field in `ExaSearchOptions` gains `"keyword"` literal.

**Assessment:** Minimal, correct. The existing passthrough logic (`if type && type !== "auto"`) already handles it. No behavior change.

---

## Task 2: `smart-search.ts` — `enhanceQuery`

**Patterns reviewed:**
- `looksErrorLike`: 4 targeted regexes covering named JS errors, "Cannot read properties", "is not defined/a function", and stack-trace lines. False-positive risk is low — the `/^\s*at\s+\S.+$/m` pattern requires a non-space char after "at" (won't match "at the store").
- `isVagueCodingQuery`: word count 1-3 AND at least one CODING_TERMS hit. Clean gate.
- `expandQuery`: appends " docs example" — minimal, predictable, testable.
- `looksErrorLike` short-circuits before `isVagueCodingQuery` — correct ordering (errors should never be expanded).

**No issues.**

---

## Task 3: `smart-search.ts` — `postProcessResults`

**URL dedup:**
- Strips 7 tracking params (utm_*, gclid, fbclid)
- Strips trailing slash from non-root paths
- Falls back gracefully for malformed URLs (`null` → included, not deduplicated)

**Snippet cleaning:**
- Breadcrumb regex: `(?:[^>\n]+\s>\s){2,}` — requires 2+ `>` separators, anchored to start. Won't strip content in the middle of a snippet.
- Last-updated regex: month-name + day + 4-digit-year. Conservative, won't match other date formats.
- Falls back to original snippet if cleaning results in empty string.

**Defensive coding:** `typeof url === "string"` / `typeof snippet === "string"` guards handle malformed entries cleanly.

**No issues.**

---

## Task 4: `index.ts` — Integration

**Fail-open design:**
1. `enhanceQuery` failure → original query, `type: undefined`, no notes
2. `postProcessResults` failure → raw `searchResults`, `duplicatesRemoved = 0`

**Type precedence:** `enhanced.typeOverride ?? type` — smart search overrides when it has an opinion; user-provided type used otherwise. Correct.

**Notes logic:** Only shown when behavior changed:
- `"Keyword search used."` → only when `typeOverride === "keyword"`
- `"Searched as: ..."` → only when `queryChanged === true`
- Dedup counts not surfaced (correctly omitted per plan)

**Schema unchanged:** `WebSearchParams` has no `smartSearch` field. ✓

**No issues.**

---

## Test Quality

- `smart-search.test.ts`: 11 unit tests covering happy paths + edge cases (title-cased "Error" not triggering keyword, no version invention, non-coding short queries)
- `smart-search.integration.test.ts`: 1 end-to-end test covering keyword, expansion, fail-open, and unchanged-query paths in a single integration assertion
- Mocking pattern consistent with existing `index.test.ts`

---

## Pre-existing Issue (out of scope)

`extract.ts` has a TS7016 error for missing `turndown` type declarations. This predated this issue (baseline had 9 tsc errors; post-implementation has 1). Not introduced by this work.
