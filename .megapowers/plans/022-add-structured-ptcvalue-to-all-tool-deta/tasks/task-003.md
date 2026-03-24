---
id: 3
title: Add ptcValue to code_search executor
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
files_to_create: []
---

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
