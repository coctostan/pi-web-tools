---
id: 19
type: bugfix
status: done
created: 2026-03-06T14:40:19.799Z
priority: 2
---
# similarUrl ignores freshness/category/domain filters — silently dropped
## Bug

When `web_search` is called with `similarUrl`, the `findSimilarExa` function ignores `freshness`, `category`, `includeDomains`, and `excludeDomains`. These are silently dropped with no user-facing warning. The user has no idea their filters aren't being applied.

**Confirmed in session test:** `web_search({ similarUrl: "https://bun.sh/", freshness: "day" })` returned results with no freshness filtering.

## Root cause

`exa-search.ts` — `findSimilarExa` request body:
```ts
const requestBody: Record<string, unknown> = {
  url,
  numResults,
  contents: ...
};
// maxAgeHours, category, includeDomains, excludeDomains — NEVER added
```

Compare to `searchExa` which includes all of these.

## Fix

Check Exa's `findSimilar` API docs to confirm which params are supported, then:

1. Add `maxAgeHours` if Exa supports it for findSimilar (likely yes)
2. Add `includeDomains` / `excludeDomains` if supported
3. For any filter that findSimilar does NOT support, emit a warning note in the result (like "Note: freshness filter not supported for similarUrl searches.")

## Files

- `exa-search.ts` — `findSimilarExa` request body construction
- `exa-search.test.ts` — add test asserting maxAgeHours is sent for findSimilar
- `README.md` — document which params are supported with `similarUrl`
