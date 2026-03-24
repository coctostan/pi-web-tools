---
id: 1
title: Add ptc metadata to all 4 tool registrations
status: approved
depends_on: []
no_test: false
files_to_modify:
  - index.ts
files_to_create:
  - ptc-value.test.ts
---

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
