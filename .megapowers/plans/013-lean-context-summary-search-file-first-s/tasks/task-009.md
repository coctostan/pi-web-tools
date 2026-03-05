---
id: 9
title: Update web_search tool description to mention summary default
status: approved
depends_on:
  - 8
no_test: true
files_to_modify:
  - index.ts
files_to_create: []
---

### Task 9: Update web_search tool description to mention summary default [no-test] [depends: 8]

**AC covered:** AC 10

**Justification:** Tool description text change only — no observable behavior to test.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

In `index.ts`, update the `web_search` tool's `description` field (around line 171):

From:
```typescript
description:
  "Search the web for pages matching a query. Returns highlights (short relevant excerpts), not full page content. Use `fetch_content` to read a page in full. Supports batch searching with multiple queries.",
```

To:
```typescript
description:
  "Search the web for pages matching a query. Returns summaries by default (~1 line per result). Use `detail: \"highlights\"` for longer excerpts. Use `fetch_content` to read a page in full. Supports batch searching with multiple queries.",
```

**Step 2 — Verify**

Run: `npx vitest run`

Expected: All tests passing — no behavioral change.
