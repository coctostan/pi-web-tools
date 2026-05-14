# Plan

### Task 1: Add hits/misses counters + resetCounters() to research-cache.ts

Covers AC 14 and bootstraps state for AC 12.

**Files:**
- Modify: `research-cache.ts`
- Test: `research-cache.test.ts`

**Step 1 — Write the failing test**
Append to `research-cache.test.ts`:
```ts
import { resetCounters, getHitsForTest, getMissesForTest } from "./research-cache.js";

describe("resetCounters", () => {
  it("zeros internal hits and misses counters", () => {
    // Simulate counters being non-zero by importing internal getters
    resetCounters();
    expect(getHitsForTest()).toBe(0);
    expect(getMissesForTest()).toBe(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `SyntaxError: The requested module './research-cache.js' does not provide an export named 'resetCounters'`

**Step 3 — Write minimal implementation**
In `research-cache.ts`, add at module scope (near the top, after imports):
```ts
let hits = 0;
let misses = 0;

export function resetCounters(): void {
  hits = 0;
  misses = 0;
}

// test-only accessors so unit tests can verify counter mutations
export function getHitsForTest(): number { return hits; }
export function getMissesForTest(): number { return misses; }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 2: Increment hits/misses inside getCached [depends: 1]

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

### Task 3: Add getCacheStats to research-cache.ts [depends: 1, 2]

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

### Task 4: Add clearCache(cacheFilePath) to research-cache.ts [depends: 1]

Covers AC 15.

**Files:**
- Modify: `research-cache.ts`
- Test: `research-cache.test.ts`

**Step 1 — Write the failing test**
Append to `research-cache.test.ts`:
```ts
import { clearCache } from "./research-cache.js";
import { existsSync } from "node:fs";

describe("clearCache", () => {
  let tempDir: string;
  let cacheFilePath: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-research-cache-clear-"));
    cacheFilePath = join(tempDir, "research-cache.json");
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("empties all entries from an existing cache file", () => {
    putCache("https://a.com", "p", "m", "ans", 1440, cacheFilePath);
    expect(existsSync(cacheFilePath)).toBe(true);
    clearCache(cacheFilePath);
    expect(getCached("https://a.com", "p", "m", 1440, cacheFilePath)).toBeNull();
    // file may still exist but with empty object content
    const raw = JSON.parse(readFileSync(cacheFilePath, "utf-8"));
    expect(Object.keys(raw)).toHaveLength(0);
  });

  it("does not throw when cache file is missing", () => {
    expect(() => clearCache(join(tempDir, "nonexistent.json"))).not.toThrow();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `SyntaxError: The requested module './research-cache.js' does not provide an export named 'clearCache'`

**Step 3 — Write minimal implementation**
Add to `research-cache.ts`:
```ts
export function clearCache(cacheFilePath: string): void {
  try {
    saveCache(cacheFilePath, {});
  } catch {
    // best-effort: missing file or write failure is tolerated
  }
}
```
(Note: `saveCache` already creates parent dirs and silently swallows errors; if file is missing it will simply write an empty object.)

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 5: Add purgeExpired(cacheFilePath) to research-cache.ts [depends: 1, 2]

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

### Task 6: Create commands.ts with dispatch + help subcommand

Covers AC 3, AC 8, AC 11 (line cap).

**Files:**
- Create: `commands.ts`
- Create: `commands.test.ts`

**Step 1 — Write the failing test**
Create `commands.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { dispatch, type DispatchDeps } from "./commands.js";

function makeDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    getCacheStats: vi.fn(() => ({ entries: 0, hits: 0, misses: 0, oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440 })),
    clearCache: vi.fn(),
    purgeExpired: vi.fn(),
    resetCounters: vi.fn(),
    listResults: vi.fn(() => []),
    confirm: vi.fn(async () => true),
    notify: vi.fn(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

describe("dispatch(help)", () => {
  it("notifies a usage summary listing the five subcommands", async () => {
    const deps = makeDeps();
    await dispatch("help", "", deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    for (const sub of ["stats", "clear-cache", "purge-expired", "recent", "help"]) {
      expect(msg).toContain(sub);
    }
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `Error: Failed to load url ./commands.js (resolved id: ./commands.js) ... Does the file exist?`

**Step 3 — Write minimal implementation**
Create `commands.ts`:
```ts
import type { CacheStats } from "./research-cache.js";
import type { StoredResultData } from "./storage.js";

export interface DispatchDeps {
  getCacheStats: () => CacheStats;
  clearCache: () => void;
  purgeExpired: () => void;
  resetCounters: () => void;
  listResults: () => StoredResultData[];
  confirm: (title: string, message: string) => Promise<boolean>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  now: () => number;
}

const SUBCOMMANDS = ["stats", "clear-cache", "purge-expired", "recent", "help"] as const;

function helpText(): string {
  return [
    "/web-tools subcommands:",
    "  stats          Show cache entry count, hits, misses, age, size, TTL",
    "  clear-cache    Remove all entries from the persistent research cache",
    "  purge-expired  Remove only entries past their TTL",
    "  recent         List recent session results (search/fetch/context)",
    "  help           Show this help",
  ].join("\n");
}

export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "help") {
    deps.notify(helpText(), "info");
    return;
  }
}

export const __test = { SUBCOMMANDS, helpText };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 7: Handle unknown subcommand in dispatch [depends: 6]

Covers AC 9.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
describe("dispatch(unknown)", () => {
  it("notifies an unknown-subcommand message and points at /web-tools help", async () => {
    const deps = makeDeps();
    await dispatch("bogus", "", deps);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(msg.toLowerCase()).toContain("unknown subcommand");
    expect(msg).toMatch(/\/web-tools help|stats/);
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called at least once` (no notify for bogus subcommand)

**Step 3 — Write minimal implementation**
In `commands.ts`, add fallback before the function returns:
```ts
export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "help") {
    deps.notify(helpText(), "info");
    return;
  }
  deps.notify(`Unknown subcommand: "${sub}". Try /web-tools help.\n\n${helpText()}`, "warning");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 8: Empty/whitespace subcommand defaults to help [depends: 6]

Covers AC 10.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
describe("dispatch(empty)", () => {
  it("empty or whitespace-only subcommand behaves like help (not unknown)", async () => {
    const deps = makeDeps();
    await dispatch("", "", deps);
    await dispatch("   ", "", deps);
    expect(deps.notify).toHaveBeenCalledTimes(2);
    for (const call of (deps.notify as any).mock.calls) {
      const msg = call[0] as string;
      const type = call[1];
      // Help-path message: does NOT start with the unknown-subcommand prefix
      expect(msg).not.toMatch(/unknown subcommand/i);
      // notify severity for help is "info", not "warning"
      expect(type ?? "info").toBe("info");
      expect(msg).toContain("stats");
      expect(msg).toContain("clear-cache");
      expect(msg).toContain("purge-expired");
      expect(msg).toContain("recent");
      expect(msg.split("\n").length).toBeLessThanOrEqual(20);
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected 'Unknown subcommand: "". Try /web-tools help.\n\n...' not to match /unknown subcommand/i` (empty subcommand currently falls through to the unknown handler from Task 7, which emits a `"warning"` notify whose message starts with `Unknown subcommand:`).

**Step 3 — Write minimal implementation**
Edit `dispatch` in `commands.ts` so empty/whitespace short-circuits to help:
```ts
export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "" || sub === "help") {
    deps.notify(helpText(), "info");
    return;
  }
  deps.notify(`Unknown subcommand: "${sub}". Try /web-tools help.\n\n${helpText()}`, "warning");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 9: dispatch("stats") prints stats summary [depends: 3, 6]

Covers AC 4.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
describe("dispatch(stats)", () => {
  it("prints entries, hits, misses, oldest, newest, sizeBytes, and ttlMinutes", async () => {
    const stats = {
      entries: 3, hits: 7, misses: 2,
      oldest: 1_700_000_000_000, newest: 1_700_000_500_000,
      sizeBytes: 1234, ttlMinutes: 1440,
    };
    const deps = makeDeps({ getCacheStats: vi.fn(() => stats) });
    await dispatch("stats", "", deps);
    expect(deps.getCacheStats).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg).toMatch(/entries[^\n]*3/i);
    expect(msg).toMatch(/hits[^\n]*7/i);
    expect(msg).toMatch(/miss(es)?[^\n]*2/i);
    expect(msg).toContain("1234"); // sizeBytes
    expect(msg).toContain("1440"); // ttlMinutes
    expect(msg).toContain(new Date(stats.oldest).toISOString());
    expect(msg).toContain(new Date(stats.newest).toISOString());
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called at least once` for `getCacheStats` (currently stats subcommand falls into the unknown-handler path).

**Step 3 — Write minimal implementation**
In `commands.ts`, add a stats branch before the unknown fallback:
```ts
function formatTs(ts: number | null): string {
  return ts === null ? "—" : new Date(ts).toISOString();
}

function statsText(s: CacheStats): string {
  return [
    "Cache stats:",
    `  entries:     ${s.entries}`,
    `  hits:        ${s.hits}`,
    `  misses:      ${s.misses}`,
    `  oldest:      ${formatTs(s.oldest)}`,
    `  newest:      ${formatTs(s.newest)}`,
    `  sizeBytes:   ${s.sizeBytes}`,
    `  ttlMinutes:  ${s.ttlMinutes}`,
  ].join("\n");
}

export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "" || sub === "help") { deps.notify(helpText(), "info"); return; }
  if (sub === "stats") { deps.notify(statsText(deps.getCacheStats()), "info"); return; }
  deps.notify(`Unknown subcommand: "${sub}". Try /web-tools help.\n\n${helpText()}`, "warning");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 10: dispatch("clear-cache") gates on confirm [depends: 4, 6]

Covers AC 5.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
describe("dispatch(clear-cache)", () => {
  it("does nothing when confirm resolves false", async () => {
    const deps = makeDeps({ confirm: vi.fn(async () => false) });
    await dispatch("clear-cache", "", deps);
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.clearCache).not.toHaveBeenCalled();
    expect(deps.resetCounters).not.toHaveBeenCalled();
  });

  it("clears cache and resets counters when confirm resolves true", async () => {
    const deps = makeDeps({ confirm: vi.fn(async () => true) });
    await dispatch("clear-cache", "", deps);
    expect(deps.clearCache).toHaveBeenCalledTimes(1);
    expect(deps.resetCounters).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called once, but got 0` for `confirm` (clear-cache currently hits unknown-handler).

**Step 3 — Write minimal implementation**
Add a clear-cache branch in `dispatch`:
```ts
  if (sub === "clear-cache") {
    const ok = await deps.confirm("Clear research cache?", "This removes all cached web-tools answers from disk.");
    if (!ok) { deps.notify("Clear cache cancelled.", "info"); return; }
    deps.clearCache();
    deps.resetCounters();
    deps.notify("Research cache cleared.", "info");
    return;
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 11: dispatch("purge-expired") invokes purge but not resetCounters [depends: 5, 6]

Covers AC 6.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
describe("dispatch(purge-expired)", () => {
  it("invokes purgeExpired and does NOT reset counters", async () => {
    const deps = makeDeps();
    await dispatch("purge-expired", "", deps);
    expect(deps.purgeExpired).toHaveBeenCalledTimes(1);
    expect(deps.resetCounters).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called once, but got 0` for `purgeExpired`.

**Step 3 — Write minimal implementation**
Add to `dispatch`:
```ts
  if (sub === "purge-expired") {
    deps.purgeExpired();
    deps.notify("Expired cache entries purged.", "info");
    return;
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 12: dispatch("recent") lists mixed-type session entries [depends: 6]

Covers AC 7, AC 11, AC 22.

`StoredResultData` shape (from `storage.ts`):
```ts
{ id: string; type: "search" | "fetch" | "context"; timestamp: number;
  queries?: QueryResultData[]; urls?: ExtractedContent[]; context?: ContextResultData }
```

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
import type { StoredResultData } from "./storage.js";

describe("dispatch(recent)", () => {
  it("lists one search, one fetch, one context entry with type/label/age/charCount within line cap", async () => {
    const now = 1_700_000_600_000;
    const entries: StoredResultData[] = [
      {
        id: "s1", type: "search", timestamp: now - 30_000,
        queries: [{ query: "typescript generics", answer: "abcdef", results: [], error: null }],
      },
      {
        id: "f1", type: "fetch", timestamp: now - 60_000,
        urls: [{ url: "https://example.com/page", title: "Example", content: "hello world", error: null }],
      },
      {
        id: "c1", type: "context", timestamp: now - 90_000,
        context: { query: "react hooks", content: "snippet body", error: null },
      },
    ];
    const deps = makeDeps({ listResults: vi.fn(() => entries), now: () => now });
    await dispatch("recent", "", deps);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg).toMatch(/search/);
    expect(msg).toMatch(/fetch/);
    expect(msg).toMatch(/context/);
    expect(msg).toContain("typescript generics");
    expect(msg).toContain("https://example.com/page");
    expect(msg).toContain("react hooks");
    // age formatting (e.g. "30s") and char counts
    expect(msg).toMatch(/30s|1m/);
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected '... Unknown subcommand: "recent" ...' to match /search/` (recent currently hits the unknown branch).

**Step 3 — Write minimal implementation**
Add to `commands.ts`:
```ts
function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function labelFor(entry: StoredResultData): { label: string; chars: number } {
  if (entry.type === "search" && entry.queries) {
    const qs = entry.queries.map((q) => q.query).join(", ");
    const chars = entry.queries.reduce((n, q) => n + (q.answer?.length ?? 0), 0);
    return { label: qs, chars };
  }
  if (entry.type === "fetch" && entry.urls && entry.urls.length > 0) {
    const first = entry.urls[0];
    const chars = entry.urls.reduce((n, u) => n + (u.content?.length ?? 0), 0);
    return { label: first.url, chars };
  }
  if (entry.type === "context" && entry.context) {
    return { label: entry.context.query, chars: entry.context.content?.length ?? 0 };
  }
  return { label: entry.id, chars: 0 };
}

function recentText(entries: StoredResultData[], now: number): string {
  if (entries.length === 0) return "No recent results in this session.";
  const MAX_LINES = 18;
  const lines: string[] = ["Recent session results:"];
  const slice = entries.slice(-MAX_LINES);
  for (const e of slice) {
    const { label, chars } = labelFor(e);
    const age = formatAge(Math.max(0, now - (e.timestamp ?? now)));
    const short = label.length > 60 ? label.slice(0, 57) + "…" : label;
    lines.push(`  [${e.type}] ${short} • ${age} • ${chars} chars`);
  }
  return lines.join("\n");
}
```
And add the recent branch:
```ts
  if (sub === "recent") {
    deps.notify(recentText(deps.listResults(), deps.now()), "info");
    return;
  }
```
Also add the import: `import type { StoredResultData } from "./storage.js";`

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 13: Register /web-tools command with subcommand autocomplete in index.ts [depends: 6, 7, 8, 9, 10, 11, 12]

Covers AC 1, AC 2, AC 18, AC 19 (real bindings wiring resetCounters only on clear-cache).

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**
Append a new `describe` block to `index.test.ts`:
```ts
describe("/web-tools slash command registration", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  async function loadExtensionWithCommandSpy() {
    const commands = new Map<string, any>();
    const pi = {
      on: vi.fn(),
      registerTool: vi.fn(),
      registerCommand: vi.fn((name: string, opts: any) => commands.set(name, { name, ...opts })),
      appendEntry: vi.fn(),
    };
    const { default: registerExtension } = await import("./index.js");
    registerExtension(pi as any);
    return { pi, commands };
  }

  it("registers a single /web-tools command with a description", async () => {
    const { pi, commands } = await loadExtensionWithCommandSpy();
    expect(pi.registerCommand).toHaveBeenCalledTimes(1);
    const cmd = commands.get("web-tools");
    expect(cmd).toBeDefined();
    expect(typeof cmd.description).toBe("string");
    expect(cmd.description.length).toBeGreaterThan(0);
    expect(typeof cmd.handler).toBe("function");
    expect(typeof cmd.getArgumentCompletions).toBe("function");
  });

  it("getArgumentCompletions returns the five subcommands filtered by prefix", async () => {
    const { commands } = await loadExtensionWithCommandSpy();
    const cmd = commands.get("web-tools");
    const all = await cmd.getArgumentCompletions("");
    expect(all.map((i: any) => i.value).sort()).toEqual(
      ["clear-cache", "help", "purge-expired", "recent", "stats"],
    );
    const filtered = await cmd.getArgumentCompletions("pur");
    expect(filtered.map((i: any) => i.value)).toEqual(["purge-expired"]);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "slash command registration"`
Expected: FAIL — `TypeError: pi.registerCommand is not a function` (currently `index.ts` does not call `pi.registerCommand`).

**Step 3 — Write minimal implementation**
Edit `index.ts`. Add imports near the top of the file (after the existing imports):
```ts
import { dispatch } from "./commands.js";
import { getCacheStats, clearCache, purgeExpired, resetCounters } from "./research-cache.js";
```

Inside the default exported function (after the existing `pi.on(...)` registrations and tool registrations), add:
```ts
  // ---------------------------------------------------------------------------
  // Slash command: /web-tools
  // ---------------------------------------------------------------------------
  const SUBCOMMAND_NAMES = ["stats", "clear-cache", "purge-expired", "recent", "help"];

  pi.registerCommand("web-tools", {
    description: "Inspect and manage the pi-web-tools research cache and session results.",
    getArgumentCompletions: (prefix: string) => {
      const items = SUBCOMMAND_NAMES
        .filter((n) => n.startsWith(prefix))
        .map((n) => ({ value: n, label: n }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: any) => {
      const trimmed = (args ?? "").trim();
      const [sub, ...rest] = trimmed.split(/\s+/);
      const subArgs = rest.join(" ");
      const cfg = getConfig();
      await dispatch(sub ?? "", subArgs, {
        getCacheStats: () => getCacheStats(DEFAULT_CACHE_FILE, cfg.cacheTTLMinutes),
        clearCache: () => clearCache(DEFAULT_CACHE_FILE),
        purgeExpired: () => purgeExpired(DEFAULT_CACHE_FILE),
        resetCounters: () => resetCounters(),
        listResults: () => getAllResults(),
        confirm: (title: string, message: string) => ctx.ui.confirm(title, message),
        notify: (msg: string, type?: "info" | "warning" | "error") => ctx.ui.notify(msg, type ?? "info"),
        now: () => Date.now(),
      });
    },
  });
```

Note: the real-binding lambdas above satisfy AC 18 (clear-cache → resetCounters happens inside `dispatch`) and AC 19 (purge-expired binding does NOT call resetCounters). The fact that `dispatch("clear-cache")` invokes its `resetCounters` dep and `dispatch("purge-expired")` does not is already enforced by Tasks 10 and 11.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "slash command registration"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 14: handleSessionStart calls resetCounters() for every reason [depends: 1, 13]

Covers AC 17.

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**
Append to `index.test.ts`:
```ts
describe("session_start resets cache counters (AC 17)", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it.each(["startup", "reload", "new", "resume", "fork"] as const)(
    "session_start reason=%s invokes resetCounters",
    async (reason) => {
      const resetCountersSpy = vi.fn();
      vi.doMock("./research-cache.js", () => ({
        getCached: vi.fn(() => null),
        putCache: vi.fn(),
        getCacheStats: vi.fn(() => ({ entries: 0, hits: 0, misses: 0, oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440 })),
        clearCache: vi.fn(),
        purgeExpired: vi.fn(),
        resetCounters: resetCountersSpy,
      }));
      const handlers = new Map<string, any>();
      const pi = {
        on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
        registerTool: vi.fn(),
        registerCommand: vi.fn(),
        appendEntry: vi.fn(),
      };
      const { default: registerExtension } = await import("./index.js");
      registerExtension(pi as any);
      const handler = handlers.get("session_start");
      expect(handler).toBeDefined();
      await handler({ type: "session_start", reason }, { sessionManager: { getEntries: () => [], getSessionId: () => `${reason}-sid` } } as any);
      expect(resetCountersSpy).toHaveBeenCalledTimes(1);
    },
  );
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "resets cache counters"`
Expected: FAIL — `AssertionError: expected "spy" to be called 1 times, but got 0 times` (handleSessionStart does not call resetCounters yet).

**Step 3 — Write minimal implementation**
Edit `handleSessionStart` in `index.ts` to call `resetCounters()` once at entry (before the `switch`). Also import `resetCounters` (already imported in Task 13). The simplest place:

```ts
function handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void {
  resetCounters();
  const initialDir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  pruneStaleStoreFiles(initialDir, 24 * 60 * 60 * 1000);
  // ... existing switch unchanged
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "resets cache counters"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
