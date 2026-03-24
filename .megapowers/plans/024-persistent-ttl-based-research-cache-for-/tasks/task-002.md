---
id: 2
title: "research-cache.ts: getCached returns cached answer or null"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - research-cache.ts
  - research-cache.test.ts
files_to_create: []
---

### Task 2: research-cache.ts: getCached returns cached answer or null [depends: 1]

**Files:**
- Modify: `research-cache.ts`
- Modify: `research-cache.test.ts`

**Step 1 — Write the failing test**

Add to `research-cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCacheKey, getCached, putCache, type CacheEntry } from "./research-cache.js";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
    // Write a cache entry that expired 1 minute ago
    const key = getCacheKey("https://example.com", "prompt", "model");
    const entry: CacheEntry = {
      key,
      url: "https://example.com",
      prompt: "prompt",
      model: "model",
      answer: "old answer",
      fetchedAt: Date.now() - (1441 * 60 * 1000), // 1441 minutes ago
      ttlMinutes: 1440,
    };
    const cacheData: Record<string, CacheEntry> = { [key]: entry };
    writeFileSync(cacheFilePath, JSON.stringify(cacheData));

    const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
    expect(result).toBeNull();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `getCached is not a function` or `putCache is not a function`

**Step 3 — Write minimal implementation**

Add to `research-cache.ts`:

```typescript
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
  ttlMinutes: number,
  cacheFilePath: string
): string | null {
  const cache = loadCache(cacheFilePath);
  const key = getCacheKey(url, prompt, model);
  const entry = cache[key];
  if (!entry) return null;

  const now = Date.now();
  const expiresAt = entry.fetchedAt + entry.ttlMinutes * 60 * 1000;
  if (now > expiresAt) {
    // Expired — prune lazily (will be cleaned on next write)
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
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
