---
id: 7
title: Add prompt parameter to FetchContentParams schema
status: approved
depends_on: []
no_test: false
files_to_modify:
  - index.ts
  - tool-params.ts
  - tool-params.test.ts
files_to_create: []
---

### Task 7: Add prompt parameter to FetchContentParams schema

**Files:**
- Modify: `index.ts`
- Modify: `tool-params.ts`
- Modify: `tool-params.test.ts`

**Step 1 — Write the failing test**

Add to `tool-params.test.ts`:

```typescript
describe("normalizeFetchContentInput", () => {
  // ... existing tests ...

  it("extracts prompt string when provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      prompt: "What is the API rate limit?",
    });
    expect(result.prompt).toBe("What is the API rate limit?");
  });

  it("defaults prompt to undefined when not provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
    });
    expect(result.prompt).toBeUndefined();
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tool-params.test.ts`

Expected: FAIL — `Property 'prompt' does not exist on type '{ urls: string[]; forceClone: boolean | undefined; }'`

**Step 3 — Write minimal implementation**

1. In `tool-params.ts`, update `normalizeFetchContentInput`:

```typescript
export function normalizeFetchContentInput(params: { url?: unknown; urls?: unknown; forceClone?: unknown; prompt?: unknown }) {
  const url = typeof params.url === "string" ? params.url : undefined;
  const urls = Array.isArray(params.urls)
    ? params.urls.filter((u): u is string => typeof u === "string")
    : undefined;

  const urlList = (urls && urls.length > 0) ? urls : (url ? [url] : []);
  if (urlList.length === 0) {
    throw new Error("Either 'url' or 'urls' must be provided.");
  }

  const forceClone = typeof params.forceClone === "boolean" ? params.forceClone : undefined;
  const prompt = typeof params.prompt === "string" ? params.prompt : undefined;
  return { urls: dedupeUrls(urlList), forceClone, prompt };
}
```

2. In `index.ts`, update `FetchContentParams` schema:

```typescript
const FetchContentParams = Type.Object({
  url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
  forceClone: Type.Optional(Type.Boolean({ description: "Force cloning large GitHub repos" })),
  prompt: Type.Optional(Type.String({ description: "Question to answer from the fetched content. When provided, content is filtered through a cheap model and only the focused answer is returned (~200-1000 chars instead of full page)." })),
});
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tool-params.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing
