---
id: 1
title: freshness param — tool-params, exa-search, index
status: approved
depends_on: []
no_test: false
files_to_modify:
  - tool-params.ts
  - exa-search.ts
  - index.ts
  - tool-params.test.ts
  - exa-search.test.ts
files_to_create: []
---

Add `freshness` enum to `web_search`, mapping to Exa's `maxAgeHours` request field.

### TDD Steps

**RED — write failing tests first**

In `tool-params.test.ts`, add tests for `normalizeWebSearchInput`:
- `freshness: "realtime"` → returned object has `maxAgeHours: 0`
- `freshness: "day"` → `maxAgeHours: 24`
- `freshness: "week"` → `maxAgeHours: 168`
- `freshness: "any"` → no `maxAgeHours` key in result
- `freshness` omitted → no `maxAgeHours` key in result

In `exa-search.test.ts`, add tests for `searchExa`:
- called with `maxAgeHours: 24` → request body JSON includes `"maxAgeHours": 24`
- called without `maxAgeHours` → request body JSON does NOT include `"maxAgeHours"` key

**GREEN — implement**

`tool-params.ts`:
- Add `freshness?: unknown` to the `normalizeWebSearchInput` params shape
- Add `const FRESHNESS_MAP: Record<string, number | undefined> = { realtime: 0, day: 24, week: 168, any: undefined }`
- Compute `maxAgeHours`: if `params.freshness` is a string key in `FRESHNESS_MAP` and not `"any"`, return the mapped number; otherwise return `undefined`
- Add `maxAgeHours` to the returned object

`exa-search.ts`:
- Add `maxAgeHours?: number` to `ExaSearchOptions` interface
- In `searchExa`, after the existing conditional blocks, add: `if (options.maxAgeHours !== undefined) { requestBody.maxAgeHours = options.maxAgeHours; }`

`index.ts`:
- Add `freshness` to `WebSearchParams` schema as an optional union of 4 literals with description
- In `execute`, destructure `maxAgeHours` from `normalizeWebSearchInput(params)` and pass it into the `searchExa` options object

**REFACTOR** — no refactor needed; this is a straight additive pass-through.
