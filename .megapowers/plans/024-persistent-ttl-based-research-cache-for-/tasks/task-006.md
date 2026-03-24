---
id: 6
title: "tool-params.ts: add noCache to normalizeFetchContentInput"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - tool-params.ts
  - tool-params.test.ts
files_to_create: []
---

### Task 6: tool-params.ts: add noCache to normalizeFetchContentInput

**Files:**
- Modify: `tool-params.ts`
- Modify: `tool-params.test.ts`

**Step 1 — Write the failing test**

Add to `tool-params.test.ts` inside the `describe("tool-params", ...)` block:

```typescript
  it("normalizeFetchContentInput extracts noCache boolean when provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      noCache: true,
    });
    expect(result.noCache).toBe(true);
  });

  it("normalizeFetchContentInput defaults noCache to undefined when not provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
    });
    expect(result.noCache).toBeUndefined();
  });

  it("normalizeFetchContentInput ignores non-boolean noCache", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      noCache: "yes",
    });
    expect(result.noCache).toBeUndefined();
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tool-params.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // expected: true, received: undefined`

**Step 3 — Write minimal implementation**

In `tool-params.ts`, modify `normalizeFetchContentInput`:

1. Update the function signature to accept `noCache`:

```typescript
export function normalizeFetchContentInput(params: { url?: unknown; urls?: unknown; forceClone?: unknown; prompt?: unknown; noCache?: unknown }) {
```

2. Add noCache normalization inside the function body, after the `prompt` line:

```typescript
  const noCache = typeof params.noCache === "boolean" ? params.noCache : undefined;
```

3. Update the return to include `noCache`:

```typescript
  return { urls: dedupeUrls(urlList), forceClone, prompt, noCache };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tool-params.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
