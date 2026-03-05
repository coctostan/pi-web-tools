# Feature: Exa Feature Unlocks — Freshness + findSimilar

**Issue:** 016 (batch of #008 + #009)  
**Branch:** feat/016-exa-feature-unlocks-freshness-findsimila  
**Status:** Done

---

## What Was Built

Two new optional parameters added to the `web_search` tool, both additive — all existing behavior unchanged.

### `freshness` — Content Recency Filter (#008)

Controls how recent Exa search results must be by mapping to Exa's `maxAgeHours` field.

| Value | `maxAgeHours` sent | Use case |
|-------|-------------------|----------|
| `"realtime"` | `0` | Breaking news, live data |
| `"day"` | `24` | Today's content |
| `"week"` | `168` | Last 7 days |
| `"any"` | *(omitted)* | No filter (default) |

When `freshness` is omitted, the field is not sent to Exa at all — identical to previous behavior.

**Motivation:** When searching for docs on a library that just released, stale Exa cache returns outdated info. `freshness: "day"` or `freshness: "realtime"` forces fresh results.

### `similarUrl` — Find Similar Pages (#009)

Finds pages similar to a given URL by routing to Exa's `/findSimilar` endpoint instead of `/search`. Mutually exclusive with `query`/`queries`.

```json
{ "similarUrl": "https://docs.example.com/getting-started" }
```

Returns results in the same `ExaSearchResult[]` format (title, url, snippet, publishedDate) as a regular search. Useful when the agent finds one good doc page and wants related content without knowing what to search for.

---

## Files Changed

| File | Change |
|------|--------|
| `exa-search.ts` | Added `maxAgeHours` to `ExaSearchOptions`; conditional inclusion in `searchExa` request body; new `findSimilarExa()` function hitting `/findSimilar` |
| `tool-params.ts` | `FRESHNESS_MAP` constant; `freshness` and `similarUrl` added to `normalizeWebSearchInput`; mutual-exclusion validation |
| `index.ts` | `freshness`/`similarUrl` in `WebSearchParams` schema; routing branch (`if similarUrl → findSimilarExa, else → searchExa loop`); `renderCall` updated for `similarUrl` display; `queryCount` fix |
| `exa-search.test.ts` | +5 tests for `searchExa` maxAgeHours, +6 tests for `findSimilarExa` (happy path + error paths) |
| `tool-params.test.ts` | +9 tests for freshness mapping and similarUrl validation |
| `index.test.ts` | +3 tests for routing and `queryCount` correctness |

**Test count:** 167 baseline → 186 final (19 new tests).

---

## Architecture Notes

- **`findSimilarExa`** mirrors `searchExa` exactly: same abort signal composition, same `retryFetch`, same `parseExaResults` parser, same API key guard. No shared HTTP helper was extracted (only 2 endpoints — YAGNI).
- **`FRESHNESS_MAP`** uses an `in` guard (`params.freshness in FRESHNESS_MAP`) rather than value truthiness, correctly preserving `realtime → 0` (falsy number) through the chain.
- **`queryCount` fix**: when `similarUrl` is used, `queryList = []`, so `queryCount` must be explicitly set to `1` (not `queryList.length`) to prevent the TUI `renderResult` from showing `"1/0 queries succeeded"`.
- **Routing in `index.ts`**: single `if (similarUrl) / else` branch replaces the pLimit loop for `findSimilar`, keeping the batch-query path unchanged.
