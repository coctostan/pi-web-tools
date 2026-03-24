---
id: 3
title: "research-cache.ts: corrupt cache file recovery"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - research-cache.test.ts
files_to_create: []
---

### Task 3: research-cache.ts: corrupt cache file recovery [depends: 2]

**Files:**
- Modify: `research-cache.test.ts`

**Step 1 — Write the failing test**

Add to `research-cache.test.ts` inside the `getCached and putCache` describe block:

```typescript
  it("handles corrupt cache file gracefully (returns null, does not throw)", () => {
    writeFileSync(cacheFilePath, "NOT VALID JSON {{{");
    const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
    expect(result).toBeNull();
  });

  it("putCache overwrites corrupt cache file successfully", () => {
    writeFileSync(cacheFilePath, "CORRUPT DATA!!!");
    putCache("https://example.com", "prompt", "model", "fresh answer", 1440, cacheFilePath);
    const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
    expect(result).toBe("fresh answer");
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS — these tests should actually pass already because `loadCache` already handles invalid JSON via try/catch. This task validates that AC 10 (corrupt cache recovery) is explicitly tested.

**Step 3 — No new implementation needed**

The implementation from Task 2 already handles this via the try/catch in `loadCache`. This task adds explicit test coverage for AC 10.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
