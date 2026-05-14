import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

let hits = 0;
let misses = 0;

export function resetCounters(): void {
  hits = 0;
  misses = 0;
}

// test-only accessors so unit tests can verify counter mutations
export function getHitsForTest(): number { return hits; }
export function getMissesForTest(): number { return misses; }
export interface CacheEntry {
  key: string;
  url: string;
  prompt: string;
  model: string;
  answer: string;
  fetchedAt: number;
  ttlMinutes: number;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  oldest: number | null;
  newest: number | null;
  sizeBytes: number;
  ttlMinutes: number;
  ok: boolean;
}

interface LoadCacheResult {
  cache: Record<string, CacheEntry>;
  ok: boolean;
  missing: boolean;
}

export function getCacheKey(url: string, prompt: string, model: string): string {
  return createHash("sha256").update(`${url}\n${prompt}\n${model}`).digest("hex");
}

function isCacheEntry(cacheKey: string, value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CacheEntry>;
  return typeof entry.key === "string" &&
    entry.key === cacheKey &&
    typeof entry.url === "string" &&
    typeof entry.prompt === "string" &&
    typeof entry.model === "string" &&
    entry.key === getCacheKey(entry.url, entry.prompt, entry.model) &&
    typeof entry.answer === "string" &&
    typeof entry.fetchedAt === "number" &&
    Number.isFinite(entry.fetchedAt) &&
    typeof entry.ttlMinutes === "number" &&
    Number.isFinite(entry.ttlMinutes) &&
    entry.ttlMinutes > 0;
}

function loadCacheResult(cacheFilePath: string): LoadCacheResult {
  try {
    const raw = readFileSync(cacheFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed);
      if (entries.every(([key, value]) => isCacheEntry(key, value))) {
        return { cache: parsed as Record<string, CacheEntry>, ok: true, missing: false };
      }
    }
    return { cache: {}, ok: false, missing: false };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    return { cache: {}, ok: code === "ENOENT", missing: code === "ENOENT" };
  }
}

function loadCache(cacheFilePath: string): Record<string, CacheEntry> {
  return loadCacheResult(cacheFilePath).cache;
}

function saveCache(cacheFilePath: string, cache: Record<string, CacheEntry>): boolean {
  try {
    mkdirSync(dirname(cacheFilePath), { recursive: true });
    writeFileSync(cacheFilePath, JSON.stringify(cache), "utf-8");
    return true;
  } catch {
    // Cache writes are best-effort for normal tool paths; callers that expose
    // destructive commands can use the boolean result to avoid false success.
    return false;
  }
}

export interface PurgeExpiredResult {
  removed: number;
  remaining: number;
  saved: boolean;
}

export function clearCache(cacheFilePath: string): boolean {
  return saveCache(cacheFilePath, {});
}

export function purgeExpired(cacheFilePath: string): PurgeExpiredResult {
  const loaded = loadCacheResult(cacheFilePath);
  if (!loaded.ok) {
    return { removed: 0, remaining: 0, saved: false };
  }
  const cache = loaded.cache;
  if (Object.keys(cache).length === 0) {
    // tolerate missing file: nothing to do
    return { removed: 0, remaining: 0, saved: true };
  }
  const now = Date.now();
  let removed = 0;
  for (const k of Object.keys(cache)) {
    const e = cache[k];
    if (now > e.fetchedAt + e.ttlMinutes * 60 * 1000) {
      delete cache[k];
      removed++;
    }
  }
  const saved = removed === 0 ? true : saveCache(cacheFilePath, cache);
  return { removed, remaining: Object.keys(cache).length, saved };
}

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

export function getCachedForModels(
  url: string,
  prompt: string,
  models: readonly string[],
  _ttlMinutes: number,
  cacheFilePath: string
): string | null {
  const cache = loadCache(cacheFilePath);
  const now = Date.now();
  for (const model of models) {
    const key = getCacheKey(url, prompt, model);
    const entry = cache[key];
    if (!entry) continue;
    if (now > entry.fetchedAt + entry.ttlMinutes * 60 * 1000) {
      delete cache[key];
      continue;
    }
    hits++;
    return entry.answer;
  }
  misses++;
  return null;
}

export function getCacheStats(cacheFilePath: string, ttlMinutes: number): CacheStats {
  const loaded = loadCacheResult(cacheFilePath);
  const values = Object.values(loaded.cache);
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const e of values) {
    if (oldest === null || e.fetchedAt < oldest) oldest = e.fetchedAt;
    if (newest === null || e.fetchedAt > newest) newest = e.fetchedAt;
  }
  let sizeBytes = 0;
  try { sizeBytes = statSync(cacheFilePath).size; } catch { sizeBytes = 0; }
  return { entries: values.length, hits, misses, oldest, newest, sizeBytes, ttlMinutes, ok: loaded.ok };
}

export function putCache(
  url: string,
  prompt: string,
  model: string,
  answer: string,
  ttlMinutes: number,
  cacheFilePath: string
): void {
  const cache = loadCache(cacheFilePath);
  const key = getCacheKey(url, prompt, model);

  // Prune expired entries lazily
  const now = Date.now();
  for (const k of Object.keys(cache)) {
    const e = cache[k];
    if (now > e.fetchedAt + e.ttlMinutes * 60 * 1000) {
      delete cache[k];
    }
  }

  cache[key] = { key, url, prompt, model, answer, fetchedAt: now, ttlMinutes };
  saveCache(cacheFilePath, cache);
}
