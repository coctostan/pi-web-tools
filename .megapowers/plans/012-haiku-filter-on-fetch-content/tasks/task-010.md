---
id: 10
title: Update fetch_content tool description with prompt guidance
status: approved
depends_on:
  - 7
no_test: true
files_to_modify:
  - index.ts
files_to_create: []
---

### Task 10: Update fetch_content tool description with prompt guidance [no-test]

**Justification:** Text-only change to the tool description string. No observable behavior change — just nudges the agent to use the `prompt` parameter.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

Update the `description` field in the `fetch_content` tool registration in `index.ts`:

```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.",
```

Change to:

```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).",
```

**Step 2 — Verify**

Run: `npx vitest run`

Expected: all tests passing (no behavior change)
