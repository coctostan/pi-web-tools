---
id: 12
title: "research-cache.ts: disk persistence survives reload"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - research-cache.test.ts
files_to_create: []
---

### Task 12: research-cache.ts: disk persistence survives reload [depends: 2]

**Files:**
- Modify: `research-cache.test.ts`

**Step 1 — Write the failing test**

Add to `research-cache.test.ts` inside the `getCached and putCache` describe block:

```typescript
  it("cache survives across separate getCached calls (disk persistence)", () => {
    // Write via putCache
    putCache("https://example.com", "prompt", "model", "persisted answer", 1440, cacheFilePath);

    // Read the raw file to confirm it's on disk
    const raw = readFileSync(cacheFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed)).toHaveLength(1);

    // A completely new getCached call reads from disk
    const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
    expect(result).toBe("persisted answer");
  });

  it("creates parent directories if cache directory does not exist", () => {
    const deepPath = join(tempDir, "a", "b", "c", "cache.json");
    putCache("https://example.com", "prompt", "model", "deep answer", 1440, deepPath);
    const result = getCached("https://example.com", "prompt", "model", 1440, deepPath);
    expect(result).toBe("deep answer");
  });
```

Note: add `readFileSync` to the existing import from `"node:fs"` if not already present from Task 4.

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS — this should already pass because `putCache` writes to disk and `getCached` reads from disk. This task explicitly validates AC 6 (disk persistence).

**Step 3 — No new implementation needed**

The implementation from Task 2 already handles disk persistence via `readFileSync`/`writeFileSync` and `mkdirSync({ recursive: true })`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
