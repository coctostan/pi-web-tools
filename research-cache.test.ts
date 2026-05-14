import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCacheKey, getCached, putCache, resetCounters, getHitsForTest, getMissesForTest, getCacheStats, clearCache, purgeExpired, type CacheEntry } from "./research-cache.js";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("research-cache", () => {
  describe("getCacheKey", () => {
    it("returns a SHA-256 hex hash of url+prompt+model", () => {
      const key = getCacheKey("https://example.com", "What is X?", "anthropic/claude-haiku-4-5");
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it("returns the same key for identical inputs", () => {
      const k1 = getCacheKey("https://example.com", "prompt", "model");
      const k2 = getCacheKey("https://example.com", "prompt", "model");
      expect(k1).toBe(k2);
    });

    it("returns different keys when url differs", () => {
      const k1 = getCacheKey("https://a.com", "prompt", "model");
      const k2 = getCacheKey("https://b.com", "prompt", "model");
      expect(k1).not.toBe(k2);
    });

    it("returns different keys when prompt differs", () => {
      const k1 = getCacheKey("https://a.com", "prompt1", "model");
      const k2 = getCacheKey("https://a.com", "prompt2", "model");
      expect(k1).not.toBe(k2);
    });

    it("returns different keys when model differs", () => {
      const k1 = getCacheKey("https://a.com", "prompt", "model-a");
      const k2 = getCacheKey("https://a.com", "prompt", "model-b");
      expect(k1).not.toBe(k2);
    });
  });

  describe("getCached and putCache", () => {
    let tempDir: string;
    let cacheFilePath: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "pi-research-cache-test-"));
      cacheFilePath = join(tempDir, "research-cache.json");
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns null on cache miss (empty cache)", () => {
      const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
      expect(result).toBeNull();
    });

    it("returns cached answer after putCache", () => {
      putCache("https://example.com", "What is X?", "anthropic/haiku", "The answer is 42.", 1440, cacheFilePath);
      const result = getCached("https://example.com", "What is X?", "anthropic/haiku", 1440, cacheFilePath);
      expect(result).toBe("The answer is 42.");
    });

    it("returns null when entry is expired", () => {
      const key = getCacheKey("https://example.com", "prompt", "model");
      const entry: CacheEntry = {
        key,
        url: "https://example.com",
        prompt: "prompt",
        model: "model",
        answer: "old answer",
        fetchedAt: Date.now() - (1441 * 60 * 1000),
        ttlMinutes: 1440,
      };
      const cacheData: Record<string, CacheEntry> = { [key]: entry };
      writeFileSync(cacheFilePath, JSON.stringify(cacheData));

      const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
      expect(result).toBeNull();
    });

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

    it("prunes expired entries when writing a new entry", () => {
      const expiredKey = getCacheKey("https://old.com", "old prompt", "model");
      const freshKey = getCacheKey("https://fresh.com", "fresh prompt", "model");
      const cacheData: Record<string, CacheEntry> = {
        [expiredKey]: {
          key: expiredKey,
          url: "https://old.com",
          prompt: "old prompt",
          model: "model",
          answer: "old answer",
          fetchedAt: Date.now() - (2000 * 60 * 1000),
          ttlMinutes: 1440,
        },
      };
      writeFileSync(cacheFilePath, JSON.stringify(cacheData));

      putCache("https://fresh.com", "fresh prompt", "model", "fresh answer", 1440, cacheFilePath);

      const result = getCached("https://old.com", "old prompt", "model", 1440, cacheFilePath);
      expect(result).toBeNull();

      const fresh = getCached("https://fresh.com", "fresh prompt", "model", 1440, cacheFilePath);
      expect(fresh).toBe("fresh answer");

      const raw = JSON.parse(readFileSync(cacheFilePath, "utf-8"));
      expect(Object.keys(raw)).toHaveLength(1);
      expect(raw[freshKey]).toBeDefined();
    });

    it("cache survives across separate getCached calls (disk persistence)", () => {
      putCache("https://example.com", "prompt", "model", "persisted answer", 1440, cacheFilePath);

      const raw = readFileSync(cacheFilePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(Object.keys(parsed)).toHaveLength(1);

      const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
      expect(result).toBe("persisted answer");
    });

    it("creates parent directories if cache directory does not exist", () => {
      const deepPath = join(tempDir, "a", "b", "c", "cache.json");
      putCache("https://example.com", "prompt", "model", "deep answer", 1440, deepPath);
      const result = getCached("https://example.com", "prompt", "model", 1440, deepPath);
      expect(result).toBe("deep answer");
    });

    it("getCached signature accepts ttlMinutes param for API consistency", () => {
      // Verify the function is callable with expected arity (5 params)
      expect(getCached.length).toBe(5);
    });
  });
});


describe("resetCounters", () => {
  it("zeros internal hits and misses counters", () => {
    resetCounters();
    expect(getHitsForTest()).toBe(0);
    expect(getMissesForTest()).toBe(0);
    expect(typeof resetCounters).toBe("function");
  });
});

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
      oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440, ok: true,
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


  it("marks corrupt cache files as not ok instead of reporting a clean empty cache", () => {
    writeFileSync(cacheFilePath, "NOT JSON");
    const stats = getCacheStats(cacheFilePath, 30);
    expect(stats.ok).toBe(false);
    expect(stats.entries).toBe(0);
    expect(readFileSync(cacheFilePath, "utf-8")).toBe("NOT JSON");
  });


  it("marks structurally invalid cache entries as not ok", () => {
    writeFileSync(cacheFilePath, JSON.stringify({ bad: {} }));
    const stats = getCacheStats(cacheFilePath, 30);
    expect(stats.ok).toBe(false);
    expect(stats.entries).toBe(0);
  });


  it("marks cache entries with mismatched keys or non-finite TTL data as not ok", () => {
    const validKey = getCacheKey("https://example.com", "prompt", "model");
    writeFileSync(cacheFilePath, JSON.stringify({
      [validKey]: {
        key: "different-key",
        url: "https://example.com",
        prompt: "prompt",
        model: "model",
        answer: "answer",
        fetchedAt: Date.now(),
        ttlMinutes: 30,
      },
    }));
    expect(getCacheStats(cacheFilePath, 30).ok).toBe(false);

    writeFileSync(cacheFilePath, JSON.stringify({
      [validKey]: {
        key: validKey,
        url: "https://example.com",
        prompt: "prompt",
        model: "model",
        answer: "answer",
        fetchedAt: null,
        ttlMinutes: 30,
      },
    }));
    expect(getCacheStats(cacheFilePath, 30).ok).toBe(false);
  });
});


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


  it("reports an unsaved result for corrupt cache files instead of false success", () => {
    writeFileSync(cacheFilePath, "NOT JSON");
    const result = purgeExpired(cacheFilePath);
    expect(result.saved).toBe(false);
    expect(result.removed).toBe(0);
    expect(readFileSync(cacheFilePath, "utf-8")).toBe("NOT JSON");
  });
});
