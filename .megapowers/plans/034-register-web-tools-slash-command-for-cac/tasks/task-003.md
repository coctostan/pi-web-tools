---
id: 3
title: Add getCacheStats to research-cache.ts
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

Covers AC 13.

**Files:**
- Modify: `research-cache.ts`
- Test: `research-cache.test.ts`

**Step 1 — Write the failing test**
Append to `research-cache.test.ts`:
```ts
import { getCacheStats } from "./research-cache.js";

describe("getCacheStats", () => {
  let tempDir: string;
  let cacheFilePath: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-research-cache-stats-"));
    cacheFilePath = join(tempDir, "research-cache.json");
    resetCounters();
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("returns zeros and nulls when the cache file does not exist", () => {
    const stats = getCacheStats(cacheFilePath, 1440);
    expect(stats).toEqual({
      entries: 0, hits: 0, misses: 0,
      oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440,
    });
  });

  it("reports entries/oldest/newest/sizeBytes for a populated cache", () => {
    const now = Date.now();
    const k1 = getCacheKey("https://a.com", "p", "m");
    const k2 = getCacheKey("https://b.com", "p", "m");
    const data: Record<string, CacheEntry> = {
      [k1]: { key: k1, url: "https://a.com", prompt: "p", model: "m", answer: "a", fetchedAt: now - 5000, ttlMinutes: 1440 },
      [k2]: { key: k2, url: "https://b.com", prompt: "p", model: "m", answer: "b", fetchedAt: now - 1000, ttlMinutes: 1440 },
    };
    writeFileSync(cacheFilePath, JSON.stringify(data));
    // bump hits/misses
    getCached("https://a.com", "p", "m", 1440, cacheFilePath); // hit
    getCached("https://nope.com", "p", "m", 1440, cacheFilePath); // miss

    const stats = getCacheStats(cacheFilePath, 1440);
    expect(stats.entries).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.oldest).toBe(now - 5000);
    expect(stats.newest).toBe(now - 1000);
    expect(stats.sizeBytes).toBeGreaterThan(0);
    expect(stats.ttlMinutes).toBe(1440);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `SyntaxError: The requested module './research-cache.js' does not provide an export named 'getCacheStats'`

**Step 3 — Write minimal implementation**
Add to `research-cache.ts`:
```ts
import { statSync } from "node:fs";

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  oldest: number | null;
  newest: number | null;
  sizeBytes: number;
  ttlMinutes: number;
}

export function getCacheStats(cacheFilePath: string, ttlMinutes: number): CacheStats {
  const cache = loadCache(cacheFilePath);
  const values = Object.values(cache);
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const e of values) {
    if (oldest === null || e.fetchedAt < oldest) oldest = e.fetchedAt;
    if (newest === null || e.fetchedAt > newest) newest = e.fetchedAt;
  }
  let sizeBytes = 0;
  try { sizeBytes = statSync(cacheFilePath).size; } catch { sizeBytes = 0; }
  return { entries: values.length, hits, misses, oldest, newest, sizeBytes, ttlMinutes };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
