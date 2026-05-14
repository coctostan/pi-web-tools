---
id: 5
title: Add purgeExpired(cacheFilePath) to research-cache.ts
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - research-cache.ts
  - research-cache.test.ts
files_to_create: []
---

Covers AC 16.

**Files:**
- Modify: `research-cache.ts`
- Test: `research-cache.test.ts`

**Step 1 — Write the failing test**
Append to `research-cache.test.ts`:
```ts
import { purgeExpired } from "./research-cache.js";

describe("purgeExpired", () => {
  let tempDir: string;
  let cacheFilePath: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-research-cache-purge-"));
    cacheFilePath = join(tempDir, "research-cache.json");
    resetCounters();
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("removes only expired entries and leaves fresh ones", () => {
    const now = Date.now();
    const expiredKey = getCacheKey("https://old.com", "p", "m");
    const freshKey = getCacheKey("https://fresh.com", "p", "m");
    const data: Record<string, CacheEntry> = {
      [expiredKey]: { key: expiredKey, url: "https://old.com", prompt: "p", model: "m", answer: "old", fetchedAt: now - (2000 * 60 * 1000), ttlMinutes: 1440 },
      [freshKey]: { key: freshKey, url: "https://fresh.com", prompt: "p", model: "m", answer: "fresh", fetchedAt: now - 1000, ttlMinutes: 1440 },
    };
    writeFileSync(cacheFilePath, JSON.stringify(data));

    purgeExpired(cacheFilePath);

    const raw = JSON.parse(readFileSync(cacheFilePath, "utf-8"));
    expect(Object.keys(raw)).toHaveLength(1);
    expect(raw[freshKey]).toBeDefined();
    expect(raw[expiredKey]).toBeUndefined();
  });

  it("does not touch hits/misses counters", () => {
    // seed counters via a hit
    putCache("https://fresh.com", "p", "m", "x", 1440, cacheFilePath);
    getCached("https://fresh.com", "p", "m", 1440, cacheFilePath); // hit++
    const hBefore = getHitsForTest();
    const mBefore = getMissesForTest();
    purgeExpired(cacheFilePath);
    expect(getHitsForTest()).toBe(hBefore);
    expect(getMissesForTest()).toBe(mBefore);
  });

  it("does not throw when cache file is missing", () => {
    expect(() => purgeExpired(join(tempDir, "nope.json"))).not.toThrow();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `SyntaxError: The requested module './research-cache.js' does not provide an export named 'purgeExpired'`

**Step 3 — Write minimal implementation**
Add to `research-cache.ts`:
```ts
export function purgeExpired(cacheFilePath: string): void {
  const cache = loadCache(cacheFilePath);
  if (Object.keys(cache).length === 0) {
    // tolerate missing file: nothing to do
    return;
  }
  const now = Date.now();
  for (const k of Object.keys(cache)) {
    const e = cache[k];
    if (now > e.fetchedAt + e.ttlMinutes * 60 * 1000) {
      delete cache[k];
    }
  }
  saveCache(cacheFilePath, cache);
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
