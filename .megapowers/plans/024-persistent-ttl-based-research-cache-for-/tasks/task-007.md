---
id: 7
title: "index.ts: add noCache to FetchContentParams schema"
status: approved
depends_on:
  - 6
no_test: true
files_to_modify:
  - index.ts
files_to_create: []
---

### Task 7: index.ts: add noCache to FetchContentParams schema [no-test] [depends: 6]

**Justification:** Schema-only change — adds `noCache` boolean to the Typebox param definition. No observable behavior change until integration (Task 8). The parameter normalization is already tested in Task 6.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

In `index.ts`, update the `FetchContentParams` definition (around line 102) to add the `noCache` field:

```typescript
const FetchContentParams = Type.Object({
  url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
  forceClone: Type.Optional(Type.Boolean({ description: "Force cloning large GitHub repos" })),
  prompt: Type.Optional(Type.String({ description: "Question to answer from the fetched content. When provided, content is filtered through a cheap model and only the focused answer is returned (~200-1000 chars instead of full page)." })),
  noCache: Type.Optional(Type.Boolean({ description: "Skip cache and fetch fresh content. The fresh result still updates the cache." })),
});
```

Also update the destructuring in the execute function (around line 448) to extract `noCache`:

```typescript
const { urls: dedupedUrls, forceClone, prompt, noCache } = normalizeFetchContentInput(params);
```

**Step 2 — Verify**
Run: `npm test`
Expected: all passing (no behavior change yet)
