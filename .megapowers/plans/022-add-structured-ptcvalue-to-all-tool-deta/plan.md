# Plan

### Task 1: Add ptc metadata to all 4 tool registrations

Add `ptc: { callable: true, policy: "read-only" }` to each `pi.registerTool()` call.

### TDD

**RED:** Write a test that mocks `pi.registerTool` and verifies all 4 tools are registered with `ptc.callable === true` and `ptc.policy === "read-only"`.

**GREEN:** Add `ptc` field to each of the 4 `registerTool` calls in `index.ts`.

**REFACTOR:** None needed.

### Implementation

Add after the `parameters` line in each tool registration:

```ts
ptc: { callable: true, policy: "read-only" },
```

For all 4 tools: `web_search` (line ~182), `fetch_content` (line ~434), `code_search` (line ~791), `get_search_content` (line ~914).

### Task 2: Add ptcValue to web_search executor [depends: 1]

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

### Task 3: Add ptcValue to code_search executor [depends: 1]

Add `details.ptcValue` to both return paths in `code_search`.

### TDD

**RED:** Write tests for:
1. Success path: verify `result.details.ptcValue` has `{ responseId, query, content, charCount, truncated }`
2. Error path: verify `result.details.ptcValue` has `{ query, error }`

**GREEN:**

Success return (~line 835):
```ts
ptcValue: {
  responseId,
  query: result.query,
  content: result.content,
  charCount: result.content.length,
  truncated,
}
```

Error return (~line 846):
```ts
ptcValue: { query, error: msg }
```

**REFACTOR:** None needed.

### Task 4: Add ptcValue to fetch_content executor [depends: 1]

Add `details.ptcValue` to all return paths in `fetch_content`. This is the most complex tool with ~9 return paths.

### TDD

**RED:** Write tests covering:
1. Single URL error → ptcValue with error
2. Single URL filtered success → ptcValue with filtered text
3. Single URL raw offloaded → ptcValue with filePath
4. Single URL GitHub clone → ptcValue with content
5. Multi-URL with prompt → ptcValue with per-URL results
6. Multi-URL without prompt → ptcValue with per-URL results

**GREEN:**

Create helper to reduce duplication:
```ts
function buildFetchUrlPtc(r: ExtractedContent, opts?: {
  filtered?: string | null,
  filePath?: string | null,
  content?: string | null,
}): object
```

For **single-URL** paths, build ptcValue at each return point:
```ts
ptcValue: {
  responseId,
  urls: [buildFetchUrlPtc(r, { ... })],
  successCount: ...,
  totalCount: 1,
}
```

For **multi-URL** paths, accumulate per-URL results during iteration:
- Multi-URL with prompt (line ~618): collect structured results alongside text blocks
- Multi-URL without prompt (line ~674): collect structured results alongside lines

Then attach at return:
```ts
ptcValue: {
  responseId,
  urls: ptcUrls,
  successCount,
  totalCount: results.length,
}
```

**REFACTOR:** Extract the helper function if it reduces complexity.

### Return paths to instrument

Single-URL (7 paths):
- Line 486: error
- Line 503: filtered success
- Line 524: filter failed, offloaded
- Line 547: filter failed, inline fallback
- Line 563: GitHub clone
- Line 580: raw inline fallback
- Line 602: raw offloaded

Multi-URL (2 paths):
- Line 662: multi-URL with prompt
- Line 712: multi-URL without prompt

### Task 5: Add ptcValue to get_search_content executor [depends: 1]

Add `details.ptcValue` to all return paths in `get_search_content`.

### TDD

**RED:** Write tests for:
1. Search — all queries → ptcValue with queries array
2. Search — single query → ptcValue with query + results
3. Fetch — all URLs summary → ptcValue with urls array
4. Fetch — single URL success → ptcValue with content
5. Fetch — single URL error → ptcValue with error
6. Context — success → ptcValue with content
7. Context — error → ptcValue with error

**GREEN:**

Each return path gets a `ptcValue` in its details object:

Search all queries (~line 957):
```ts
ptcValue: {
  type: "search",
  queries: stored.queries.map(q => ({ query: q.query, results: q.results, error: q.error })),
}
```

Search single query (~line 971):
```ts
ptcValue: {
  type: "search",
  query: targetQuery.query,
  results: targetQuery.results,
  error: targetQuery.error,
}
```

Fetch all URLs (~line 1016):
```ts
ptcValue: {
  type: "fetch",
  urls: stored.urls.map(u => ({
    url: u.url,
    title: u.title || null,
    charCount: u.error ? null : u.content.length,
    error: u.error || null,
  })),
}
```

Fetch single URL success (~line 1032):
```ts
ptcValue: {
  type: "fetch",
  url: targetContent.url,
  title: targetContent.title,
  content: targetContent.content,
  charCount: targetContent.content.length,
}
```

Fetch single URL error (~line 1023):
```ts
ptcValue: {
  type: "fetch",
  url: targetContent.url,
  error: targetContent.error,
}
```

Context success (~line 1053):
```ts
ptcValue: {
  type: "context",
  query: ctx.query,
  content: ctx.content,
  charCount: ctx.content.length,
}
```

Context error (~line 1047):
```ts
ptcValue: {
  type: "context",
  query: ctx.query,
  error: ctx.error,
}
```

**REFACTOR:** None needed — shapes are simple inline objects.

### Task 6: Verify all existing tests pass and ptcValue is JSON-serializable [no-test] [depends: 2, 3, 4, 5]

### Verification

1. Run `npm test` — all 198+ existing tests must pass
2. Add a final integration-style test that verifies all ptcValue objects are `JSON.parse(JSON.stringify(value))` round-trippable
3. Verify no existing `details` fields were removed or renamed

This is a verification task, not a new feature task.
