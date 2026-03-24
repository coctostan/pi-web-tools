import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface CacheEntry {
  key: string;
  url: string;
  prompt: string;
  model: string;
  answer: string;
  fetchedAt: number;
  ttlMinutes: number;
}

export function getCacheKey(url: string, prompt: string, model: string): string {
  return createHash("sha256").update(`${url}\n${prompt}\n${model}`).digest("hex");
}

function loadCache(cacheFilePath: string): Record<string, CacheEntry> {
  try {
    const raw = readFileSync(cacheFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, CacheEntry>;
    }
    return {};
  } catch {
    return {};
  }
}

function saveCache(cacheFilePath: string, cache: Record<string, CacheEntry>): void {
  try {
    mkdirSync(dirname(cacheFilePath), { recursive: true });
    writeFileSync(cacheFilePath, JSON.stringify(cache), "utf-8");
  } catch {
    // Silently fail — cache is best-effort
  }
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
  if (!entry) return null;

  const now = Date.now();
  const expiresAt = entry.fetchedAt + entry.ttlMinutes * 60 * 1000;
  if (now > expiresAt) {
    delete cache[key];
    return null;
  }

  return entry.answer;
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
