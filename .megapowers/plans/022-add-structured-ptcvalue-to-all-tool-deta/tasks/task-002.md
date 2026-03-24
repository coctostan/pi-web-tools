---
id: 2
title: Add ptcValue to web_search executor
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
files_to_create: []
---

Add `details.ptcValue` to the `web_search` return value.

### TDD

**RED:** Write a test that calls the web_search executor (mocking Exa), verifies `result.details.ptcValue` exists with shape:
```ts
{ responseId, queries: [{ query, results: [{title, url, snippet}], error }], queryCount, successfulQueries, totalResults }
```
Test both single query success and query with error.

**GREEN:** In the web_search executor's return statement (~line 353), add `ptcValue` to details:
```ts
ptcValue: {
  responseId: searchId,
  queries: results.map(r => ({
    query: r.query,
    results: r.results,
    error: r.error,
  })),
  queryCount: similarUrl ? 1 : queryList.length,
  successfulQueries,
  totalResults,
}
```

**REFACTOR:** None needed — single return path.
