---
id: 2
title: findSimilar — new function + similarUrl param routing
status: approved
depends_on: []
no_test: false
files_to_modify:
  - exa-search.ts
  - tool-params.ts
  - index.ts
  - exa-search.test.ts
  - tool-params.test.ts
files_to_create: []
---

Add `similarUrl` param to `web_search` that routes to Exa's `/findSimilar` endpoint.

### TDD Steps

**RED — write failing tests first**

In `exa-search.test.ts`, add tests for `findSimilarExa`:
- sends POST to `https://api.exa.ai/findSimilar` (not `/search`)
- request body includes `"url": "https://example.com"`
- returns `ExaSearchResult[]` (same shape as `searchExa` — title, url, snippet)

In `tool-params.test.ts`, add tests for `normalizeWebSearchInput`:
- `{ similarUrl: "https://example.com" }` (no `query`) → no error, returns `{ similarUrl: "https://example.com", queries: [] }`
- `{ query: "foo", similarUrl: "https://example.com" }` → throws error containing "mutually exclusive" or similar
- `{}` (neither query nor similarUrl) → still throws the existing "Either 'query' or 'queries' must be provided" error

In `index.ts` integration test (or a new file `index.test.ts` if none exists):
- `web_search` called with `{ similarUrl: "https://example.com" }` → `findSimilarExa` is called, not `searchExa`
- `web_search` called with `{ query: "foo" }` → `searchExa` is called (existing path unchanged)

**GREEN — implement**

`exa-search.ts`:
- Add `const EXA_FIND_SIMILAR_URL = "https://api.exa.ai/findSimilar";`
- Add `export async function findSimilarExa(url: string, options: ExaSearchOptions): Promise<ExaSearchResult[]>` — same structure as `searchExa` but: request body uses `{ url, numResults, contents }` (no `query` field), hits `EXA_FIND_SIMILAR_URL`, reuses `parseExaResults`

`tool-params.ts`:
- Add `similarUrl?: unknown` to `normalizeWebSearchInput` params shape
- Before the existing `queryList.length === 0` check: if both `query`/`queries` AND `similarUrl` are non-empty → throw `"'similarUrl' and 'query'/'queries' are mutually exclusive"`
- Relax the empty-queryList guard: if `queryList.length === 0` AND `similarUrl` is a non-empty string → allowed (no throw)
- Return `similarUrl` in the result object (string or undefined)

`index.ts`:
- Import `findSimilarExa` from `./exa-search.js`
- Add `similarUrl: Type.Optional(Type.String({ description: "Find pages similar to this URL (alternative to query)" }))` to `WebSearchParams`
- In `execute`, destructure `similarUrl` from `normalizeWebSearchInput(params)`
- Branch at top of try block: if `similarUrl` → call `findSimilarExa(similarUrl, { apiKey, numResults, signal: combinedSignal, detail })`, wrap result as a single `QueryResultData` with `query: similarUrl`, skip the pLimit loop; else → existing loop

**REFACTOR** — in `renderCall`, update the display text to handle `similarUrl` (show URL instead of query when `args.similarUrl` is set).
