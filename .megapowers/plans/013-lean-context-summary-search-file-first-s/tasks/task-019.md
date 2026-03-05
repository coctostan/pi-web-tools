---
id: 19
title: Update fetch_content tool description to mention file-first behavior
status: approved
depends_on:
  - 11
no_test: true
files_to_modify:
  - index.ts
files_to_create: []
---

### Task 19: Update fetch_content tool description to mention file-first behavior [no-test] [depends: 11]

**AC covered:** AC 22

**Justification:** Tool description text change only — no observable behavior to test.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

In `index.ts`, update the `fetch_content` tool's `description` field (around line 323-324):

From:
```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).",
```

To:
```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).\n\nRaw fetches (without `prompt`) return a preview + file path. Use `read` to explore the full content selectively.",
```

**Step 2 — Verify**

Run: `npx vitest run`

Expected: All tests passing — no behavioral change.
