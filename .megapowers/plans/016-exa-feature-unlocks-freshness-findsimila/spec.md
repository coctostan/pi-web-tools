# Spec: Exa Feature Unlocks — Freshness + findSimilar

## Goal

Add two new parameters to the `web_search` tool: `freshness` (controls how recent Exa search results are by mapping to Exa's `maxAgeHours` field) and `similarUrl` (finds pages similar to a given URL by routing to Exa's `/findSimilar` endpoint instead of `/search`). Both are additive — all existing behavior is unchanged.

## Acceptance Criteria

**Freshness**

1. `normalizeWebSearchInput` accepts `freshness: "realtime"` and returns `maxAgeHours: 0`
2. `normalizeWebSearchInput` accepts `freshness: "day"` and returns `maxAgeHours: 24`
3. `normalizeWebSearchInput` accepts `freshness: "week"` and returns `maxAgeHours: 168`
4. `normalizeWebSearchInput` with `freshness: "any"` returns no `maxAgeHours` field
5. `normalizeWebSearchInput` with `freshness` omitted returns no `maxAgeHours` field
6. `searchExa` called with `maxAgeHours: 24` sends `"maxAgeHours": 24` in the Exa request body
7. `searchExa` called without `maxAgeHours` omits the field from the Exa request body entirely

**findSimilar**

8. `normalizeWebSearchInput` accepts `{ similarUrl: "https://example.com" }` (no `query`) without error
9. `normalizeWebSearchInput` with both `query` and `similarUrl` provided throws an error
10. `normalizeWebSearchInput` with neither `query`/`queries` nor `similarUrl` provided throws an error
11. `findSimilarExa("https://example.com", options)` sends a POST to `https://api.exa.ai/findSimilar`
12. `findSimilarExa` includes `"url": "https://example.com"` in the request body
13. `findSimilarExa` returns results in the same `ExaSearchResult[]` format as `searchExa`
14. `web_search` with `similarUrl` calls `findSimilarExa`, not `searchExa`
15. `web_search` with `query` calls `searchExa`, not `findSimilarExa` (existing path unchanged)

**Regression**

16. All 110 existing tests pass without modification

## Out of Scope

- `freshness` on `findSimilar` (not needed for initial implementation)
- Batching multiple `similarUrl` values in one call
- Any changes to `fetch_content`, `code_search`, or `get_search_content`
- Exposing raw `maxAgeHours` as a number param (enum only)

## Open Questions

*(none)*
