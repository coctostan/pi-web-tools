import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCacheKey, getCached, putCache, type CacheEntry } from "./research-cache.js";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
