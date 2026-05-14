---
id: 2
title: Increment hits/misses inside getCached
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - research-cache.ts
  - research-cache.test.ts
files_to_create: []
---

Covers AC 12.

**Files:**
- Modify: `research-cache.ts`
- Test: `research-cache.test.ts`

**Step 1 — Write the failing test**
Append to `research-cache.test.ts`:
```ts
describe("getCached counter increments", () => {
  let tempDir: string;
  let cacheFilePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-research-cache-counters-"));
    cacheFilePath = join(tempDir, "research-cache.json");
    resetCounters();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("increments misses on a cache miss (no entry)", () => {
    getCached("https://example.com", "p", "m", 1440, cacheFilePath);
    expect(getMissesForTest()).toBe(1);
    expect(getHitsForTest()).toBe(0);
  });

  it("increments hits when an unexpired entry is returned", () => {
    putCache("https://example.com", "p", "m", "ans", 1440, cacheFilePath);
    getCached("https://example.com", "p", "m", 1440, cacheFilePath);
    expect(getHitsForTest()).toBe(1);
    expect(getMissesForTest()).toBe(0);
  });

  it("increments misses when entry is expired", () => {
    const key = getCacheKey("https://example.com", "p", "m");
    const entry: CacheEntry = {
      key, url: "https://example.com", prompt: "p", model: "m",
      answer: "old", fetchedAt: Date.now() - (1441 * 60 * 1000), ttlMinutes: 1440,
    };
    writeFileSync(cacheFilePath, JSON.stringify({ [key]: entry }));
    getCached("https://example.com", "p", "m", 1440, cacheFilePath);
    expect(getMissesForTest()).toBe(1);
    expect(getHitsForTest()).toBe(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `AssertionError: expected 0 to be 1` (misses not incrementing on miss)

**Step 3 — Write minimal implementation**
Edit `getCached` in `research-cache.ts` to increment counters:
```ts
export function getCached(
  url: string,
  prompt: string,
  model: string,
  _ttlMinutes: number,
  cacheFilePath: string
): string | null {
  const cache = loadCache(cacheFilePath);
  const key = getCacheKey(url, prompt, model);
  const entry = cache[key];
  if (!entry) { misses++; return null; }

  const now = Date.now();
  const expiresAt = entry.fetchedAt + entry.ttlMinutes * 60 * 1000;
  if (now > expiresAt) {
    delete cache[key];
    misses++;
    return null;
  }

  hits++;
  return entry.answer;
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
