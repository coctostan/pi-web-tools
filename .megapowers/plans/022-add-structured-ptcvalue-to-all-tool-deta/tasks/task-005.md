---
id: 5
title: Add ptcValue to get_search_content executor
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
files_to_create: []
---

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
