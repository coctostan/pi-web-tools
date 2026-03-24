---
id: 4
title: "research-cache.ts: lazy expiry pruning on write"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - research-cache.test.ts
files_to_create: []
---

### Task 4: research-cache.ts: lazy expiry pruning on write [depends: 2]

**Files:**
- Modify: `research-cache.test.ts`

**Step 1 — Write the failing test**

Add to `research-cache.test.ts` inside the `getCached and putCache` describe block:

```typescript
  it("prunes expired entries when writing a new entry", () => {
    // Manually write cache with an expired entry
    const expiredKey = getCacheKey("https://old.com", "old prompt", "model");
    const freshKey = getCacheKey("https://fresh.com", "fresh prompt", "model");
    const cacheData: Record<string, CacheEntry> = {
      [expiredKey]: {
        key: expiredKey,
        url: "https://old.com",
        prompt: "old prompt",
        model: "model",
        answer: "old answer",
        fetchedAt: Date.now() - (2000 * 60 * 1000), // 2000 minutes ago, well past 1440 TTL
        ttlMinutes: 1440,
      },
    };
    writeFileSync(cacheFilePath, JSON.stringify(cacheData));

    // Write a new entry — should prune the expired one
    putCache("https://fresh.com", "fresh prompt", "model", "fresh answer", 1440, cacheFilePath);

    // The expired entry should be gone
    const result = getCached("https://old.com", "old prompt", "model", 1440, cacheFilePath);
    expect(result).toBeNull();

    // The fresh entry should exist
    const fresh = getCached("https://fresh.com", "fresh prompt", "model", 1440, cacheFilePath);
    expect(fresh).toBe("fresh answer");

    // Verify on disk: only one entry
    const raw = JSON.parse(readFileSync(cacheFilePath, "utf-8"));
    expect(Object.keys(raw)).toHaveLength(1);
    expect(raw[freshKey]).toBeDefined();
  });
```

Note: add `readFileSync` to the existing import from `"node:fs"`.

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS — the pruning logic is already in `putCache` from Task 2. This task adds explicit test coverage for AC 14 (lazy pruning).

**Step 3 — No new implementation needed**

The implementation from Task 2 already prunes expired entries in `putCache`. This task validates that behavior explicitly.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
