# Plan

### Task 1: research-cache.ts: getCacheKey hashes url+prompt+model

### Task 1: research-cache.ts: getCacheKey hashes url+prompt+model

**Files:**
- Create: `research-cache.ts`
- Create: `research-cache.test.ts`

**Step 1 — Write the failing test**

```typescript
// research-cache.test.ts
import { describe, it, expect } from "vitest";
import { getCacheKey } from "./research-cache.js";

describe("research-cache", () => {
  describe("getCacheKey", () => {
    it("returns a SHA-256 hex hash of url+prompt+model", () => {
      const key = getCacheKey("https://example.com", "What is X?", "anthropic/claude-haiku-4-5");
      // SHA-256 hex is 64 chars
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
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `Error: Missing "./research-cache.js" specifier` or `getCacheKey is not a function`

**Step 3 — Write minimal implementation**

```typescript
// research-cache.ts
import { createHash } from "node:crypto";

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
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 2: research-cache.ts: getCached returns cached answer or null [depends: 1]

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

### Task 3: research-cache.ts: corrupt cache file recovery [depends: 2]

### Task 3: research-cache.ts: corrupt cache file recovery [depends: 2]

**Files:**
- Modify: `research-cache.test.ts`

**Step 1 — Write the failing test**

Add to `research-cache.test.ts` inside the `getCached and putCache` describe block:

```typescript
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS — these tests should actually pass already because `loadCache` already handles invalid JSON via try/catch. This task validates that AC 10 (corrupt cache recovery) is explicitly tested.

**Step 3 — No new implementation needed**

The implementation from Task 2 already handles this via the try/catch in `loadCache`. This task adds explicit test coverage for AC 10.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 4: research-cache.ts: lazy expiry pruning on write [depends: 2]

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

### Task 5: config.ts: add cacheTTLMinutes field with 1440 default

### Task 5: config.ts: add cacheTTLMinutes field with 1440 default

**Files:**
- Modify: `config.ts`
- Modify: `config.test.ts`

**Step 1 — Write the failing test**

Add to `config.test.ts` inside the `describe("config", ...)` block:

```typescript
  it("defaults cacheTTLMinutes to 1440 when missing", () => {
    writeFileSync(configPath, JSON.stringify({}));
    resetConfigCache();
    const config = getConfig();
    expect(config.cacheTTLMinutes).toBe(1440);
  });

  it("reads cacheTTLMinutes from config file", () => {
    writeFileSync(configPath, JSON.stringify({ cacheTTLMinutes: 60 }));
    resetConfigCache();
    const config = getConfig();
    expect(config.cacheTTLMinutes).toBe(60);
  });

  it("ignores non-number cacheTTLMinutes", () => {
    writeFileSync(configPath, JSON.stringify({ cacheTTLMinutes: "abc" }));
    resetConfigCache();
    const config = getConfig();
    expect(config.cacheTTLMinutes).toBe(1440);
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run config.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // expected: 1440, received: undefined`

**Step 3 — Write minimal implementation**

In `config.ts`:

1. Add `cacheTTLMinutes: number;` to the `WebToolsConfig` interface (after the `tools` field):

```typescript
export interface WebToolsConfig {
  exaApiKey: string | null;
  filterModel?: string;
  github: GitHubConfig;
  tools: ToolToggles;
  cacheTTLMinutes: number;
}
```

2. Add `cacheTTLMinutes: 1440` to `DEFAULT_CONFIG`:

```typescript
const DEFAULT_CONFIG: WebToolsConfig = {
  exaApiKey: null,
  filterModel: undefined,
  github: {
    maxRepoSizeMB: 350,
    cloneTimeoutSeconds: 30,
    clonePath: "/tmp/pi-github-repos",
  },
  tools: {
    web_search: true,
    code_search: true,
    fetch_content: true,
    get_search_content: true,
  },
  cacheTTLMinutes: 1440,
};
```

3. In `buildConfig()`, before the return statement, add:

```typescript
  const cacheTTLMinutes = typeof file["cacheTTLMinutes"] === "number" && Number.isFinite(file["cacheTTLMinutes"] as number)
    ? file["cacheTTLMinutes"] as number
    : DEFAULT_CONFIG.cacheTTLMinutes;
```

4. Update the return in `buildConfig()`:

```typescript
  return { exaApiKey, filterModel, github, tools, cacheTTLMinutes };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run config.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 6: tool-params.ts: add noCache to normalizeFetchContentInput

### Task 6: tool-params.ts: add noCache to normalizeFetchContentInput

**Files:**
- Modify: `tool-params.ts`
- Modify: `tool-params.test.ts`

**Step 1 — Write the failing test**

Add to `tool-params.test.ts` inside the `describe("tool-params", ...)` block:

```typescript
  it("normalizeFetchContentInput extracts noCache boolean when provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      noCache: true,
    });
    expect(result.noCache).toBe(true);
  });

  it("normalizeFetchContentInput defaults noCache to undefined when not provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
    });
    expect(result.noCache).toBeUndefined();
  });

  it("normalizeFetchContentInput ignores non-boolean noCache", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      noCache: "yes",
    });
    expect(result.noCache).toBeUndefined();
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tool-params.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // expected: true, received: undefined`

**Step 3 — Write minimal implementation**

In `tool-params.ts`, modify `normalizeFetchContentInput`:

1. Update the function signature to accept `noCache`:

```typescript
export function normalizeFetchContentInput(params: { url?: unknown; urls?: unknown; forceClone?: unknown; prompt?: unknown; noCache?: unknown }) {
```

2. Add noCache normalization inside the function body, after the `prompt` line:

```typescript
  const noCache = typeof params.noCache === "boolean" ? params.noCache : undefined;
```

3. Update the return to include `noCache`:

```typescript
  return { urls: dedupeUrls(urlList), forceClone, prompt, noCache };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tool-params.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 7: index.ts: add noCache to FetchContentParams schema [no-test] [depends: 6]

### Task 7: index.ts: add noCache to FetchContentParams schema [no-test] [depends: 6]

**Justification:** Schema-only change — adds `noCache` boolean to the Typebox param definition. No observable behavior change until integration (Task 8). The parameter normalization is already tested in Task 6.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

In `index.ts`, update the `FetchContentParams` definition (around line 102) to add the `noCache` field:

```typescript
const FetchContentParams = Type.Object({
  url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
  forceClone: Type.Optional(Type.Boolean({ description: "Force cloning large GitHub repos" })),
  prompt: Type.Optional(Type.String({ description: "Question to answer from the fetched content. When provided, content is filtered through a cheap model and only the focused answer is returned (~200-1000 chars instead of full page)." })),
  noCache: Type.Optional(Type.Boolean({ description: "Skip cache and fetch fresh content. The fresh result still updates the cache." })),
});
```

Also update the destructuring in the execute function (around line 448) to extract `noCache`:

```typescript
const { urls: dedupedUrls, forceClone, prompt, noCache } = normalizeFetchContentInput(params);
```

**Step 2 — Verify**
Run: `npm test`
Expected: all passing (no behavior change yet)

### Task 8: index.ts: integrate cache into single-URL fetch_content + prompt flow [depends: 2, 5, 7]

### Task 8: index.ts: integrate cache into single-URL fetch_content + prompt flow [depends: 2, 5, 7]

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

In `index.test.ts`:

1. Add a mock for `research-cache.js` near the other `vi.mock` blocks at the top (after the offload mock around line 88):

```typescript
const cacheState = vi.hoisted(() => ({
  getCached: vi.fn(() => null),
  putCache: vi.fn(),
}));

vi.mock("./research-cache.js", () => ({
  getCached: cacheState.getCached,
  putCache: cacheState.putCache,
}));
```

2. Also update the `configState` to include `cacheTTLMinutes`:

In the existing `configState` hoisted value (around line 19), add `cacheTTLMinutes: 1440` to the `value` object:

```typescript
const configState = vi.hoisted(() => ({
  value: {
    exaApiKey: null,
    filterModel: undefined,
    github: {
      maxRepoSizeMB: 350,
      cloneTimeoutSeconds: 30,
      clonePath: "/tmp/pi-github-repos",
    },
    tools: {
      web_search: false,
      fetch_content: true,
      code_search: false,
      get_search_content: false,
    },
    cacheTTLMinutes: 1440,
  },
}));
```

3. Add a new describe block:

```typescript
describe("fetch_content research cache integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.extractContent.mockResolvedValue({
      url: "https://docs.example.com/api",
      title: "API Docs",
      content: "RAW PAGE CONTENT",
      error: null,
    });
    state.filterContent.mockResolvedValue({
      filtered: "Rate limit is 100/min.",
      model: "anthropic/claude-haiku-4-5",
    });
    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-test.txt");
  });

  it("returns cached answer on cache hit without calling extractContent or filterContent", async () => {
    cacheState.getCached.mockReturnValueOnce("Cached: Rate limit is 100/min.");

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-cached",
      { url: "https://docs.example.com/api", prompt: "What is the rate limit?" },
      undefined,
      undefined,
      ctx
    );

    expect(cacheState.getCached).toHaveBeenCalled();
    expect(state.extractContent).not.toHaveBeenCalled();
    expect(state.filterContent).not.toHaveBeenCalled();

    const text = getText(result);
    expect(text).toContain("Source: https://docs.example.com/api");
    expect(text).toContain("Cached: Rate limit is 100/min.");
    expect(result.details.cached).toBe(true);
  });

  it("fetches and stores result on cache miss", async () => {
    cacheState.getCached.mockReturnValueOnce(null);

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-miss",
      { url: "https://docs.example.com/api", prompt: "What is the rate limit?" },
      undefined,
      undefined,
      ctx
    );

    expect(cacheState.getCached).toHaveBeenCalled();
    expect(state.extractContent).toHaveBeenCalled();
    expect(state.filterContent).toHaveBeenCalled();
    expect(cacheState.putCache).toHaveBeenCalledWith(
      "https://docs.example.com/api",
      "What is the rate limit?",
      "anthropic/claude-haiku-4-5",
      "Rate limit is 100/min.",
      1440,
      expect.any(String)
    );

    const text = getText(result);
    expect(text).toContain("Rate limit is 100/min.");
    expect(result.details.cached).toBeUndefined();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: FAIL — `expect(state.extractContent).not.toHaveBeenCalled()` fails because cache is not integrated yet

**Step 3 — Write minimal implementation**

In `index.ts`:

1. Add import for research-cache at the top (after the filter import):

```typescript
import { getCached, putCache } from "./research-cache.js";
```

2. Add a helper to compute the default cache file path (after the `pendingFetches` declaration):

```typescript
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_CACHE_FILE = join(homedir(), ".pi", "cache", "web-tools", "research-cache.json");
```

Note: `join` and `homedir` — check if they're already imported. `join` is not imported in index.ts. `homedir` is not imported. Add them.

3. In the single-URL + prompt flow (around line 503, the `if (prompt)` block), add cache check BEFORE the `filterContent` call:

Replace the single-URL prompt block (lines 503-573) with logic that checks cache first:

```typescript
          if (prompt) {
            const config = getConfig();

            // Check research cache (unless noCache)
            if (!noCache) {
              const resolvedModel = config.filterModel ?? "anthropic/claude-haiku-4-5";
              const cachedAnswer = getCached(r.url, prompt, resolvedModel, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
              if (cachedAnswer !== null) {
                return {
                  content: [{ type: "text", text: `Source: ${r.url}\n\n${cachedAnswer}` }],
                  details: {
                    responseId,
                    url: r.url,
                    title: r.title,
                    charCount: cachedAnswer.length,
                    filtered: true,
                    cached: true,
                    ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null }], successCount: 1, totalCount: 1 },
                  },
                };
              }
            }

            const filterResult = await filterContent(
              r.content,
              prompt,
              ctx.modelRegistry,
              config.filterModel,
              complete
            );

            if (filterResult.filtered !== null) {
              // Store in cache
              putCache(r.url, prompt, filterResult.model, filterResult.filtered, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);

              return {
                content: [{ type: "text", text: `Source: ${r.url}\n\n${filterResult.filtered}` }],
                details: {
                  responseId,
                  url: r.url,
                  title: r.title,
                  charCount: filterResult.filtered.length,
                  filtered: true,
                  filterModel: filterResult.model,
                  ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: null, filtered: filterResult.filtered, filePath: null, charCount: filterResult.filtered.length, error: null }], successCount: 1, totalCount: 1 },
                },
              };
            }

            // ... rest of filter-failure fallback remains unchanged ...
```

Keep the existing filter-failure fallback logic (lines 528-573) unchanged after the `filterResult.filtered !== null` block.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 9: index.ts: noCache bypasses cache read but still writes [depends: 8]

### Task 9: index.ts: noCache bypasses cache read but still writes [depends: 8]

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Add to `index.test.ts` inside the `fetch_content research cache integration` describe block:

```typescript
  it("noCache skips cache read but still writes to cache after fresh fetch", async () => {
    // Even though getCached would return a hit, noCache should skip it
    cacheState.getCached.mockReturnValueOnce("Should not be used");

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-nocache",
      { url: "https://docs.example.com/api", prompt: "What is the rate limit?", noCache: true },
      undefined,
      undefined,
      ctx
    );

    // Cache read should NOT be called (noCache skips it)
    expect(cacheState.getCached).not.toHaveBeenCalled();

    // But fetch + filter SHOULD be called
    expect(state.extractContent).toHaveBeenCalled();
    expect(state.filterContent).toHaveBeenCalled();

    // And cache write SHOULD happen
    expect(cacheState.putCache).toHaveBeenCalledWith(
      "https://docs.example.com/api",
      "What is the rate limit?",
      "anthropic/claude-haiku-4-5",
      "Rate limit is 100/min.",
      1440,
      expect.any(String)
    );

    const text = getText(result);
    expect(text).toContain("Rate limit is 100/min.");
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: PASS — this should already pass since Task 8 added the `if (!noCache)` guard around `getCached`. If it does pass, this task simply adds explicit coverage for AC 8.

**Step 3 — No new implementation needed**

The `if (!noCache)` guard in Task 8 already handles this. The `putCache` call happens unconditionally when `filterResult.filtered !== null`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 10: index.ts: integrate cache into multi-URL fetch_content + prompt flow [depends: 8]

### Task 10: index.ts: integrate cache into multi-URL fetch_content + prompt flow [depends: 8]

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Add to `index.test.ts` inside the `fetch_content research cache integration` describe block:

```typescript
  it("multi-URL + prompt: independently checks cache per URL, mixing hits and misses", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.example/docs") {
        return { url, title: "A Docs", content: "RAW A", error: null };
      }
      return { url, title: "B Docs", content: "RAW B", error: null };
    });

    // URL A: cache hit; URL B: cache miss
    cacheState.getCached.mockImplementation((url: string) => {
      if (url === "https://a.example/docs") return "Cached A answer";
      return null;
    });

    state.filterContent.mockReset();
    state.filterContent.mockResolvedValueOnce({
      filtered: "Fresh B answer",
      model: "anthropic/claude-haiku-4-5",
    });

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-multi-cache",
      {
        urls: ["https://a.example/docs", "https://b.example/docs"],
        prompt: "What are the rate limits?",
      },
      undefined,
      undefined,
      ctx
    );

    const text = getText(result);
    // URL A should come from cache
    expect(text).toContain("Cached A answer");
    // URL B should come from fresh filter
    expect(text).toContain("Fresh B answer");

    // filterContent should only be called for URL B (not A — it was cached)
    expect(state.filterContent).toHaveBeenCalledTimes(1);
    expect(state.filterContent).toHaveBeenCalledWith(
      "RAW B",
      "What are the rate limits?",
      ctx.modelRegistry,
      undefined,
      expect.any(Function)
    );

    // putCache should be called for URL B (fresh result)
    expect(cacheState.putCache).toHaveBeenCalledWith(
      "https://b.example/docs",
      "What are the rate limits?",
      "anthropic/claude-haiku-4-5",
      "Fresh B answer",
      1440,
      expect.any(String)
    );
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: FAIL — `expect(state.filterContent).toHaveBeenCalledTimes(1)` fails because cache is not checked in the multi-URL path yet (filterContent called for both URLs)

**Step 3 — Write minimal implementation**

In `index.ts`, in the multi-URL + prompt flow (around line 632, the `if (prompt)` block), add cache check before `filterContent` for each URL.

Replace the inner `limit(async () => { ... })` block (lines 638-676) with cache-aware logic:

```typescript
        if (prompt) {
          const config = getConfig();
          const limit = pLimit(3);
          const ptcUrls: Array<{ url: string, title: string | null, content: string | null, filtered: string | null, filePath: string | null, charCount: number | null, error: string | null }> = [];
          const blocks = await Promise.all(
            results.map((r) =>
              limit(async () => {
                if (r.error) {
                  ptcUrls.push({ url: r.url, title: null, content: null, filtered: null, filePath: null, charCount: null, error: r.error });
                  return `❌ ${r.url}: ${r.error}`;
                }

                // Check cache first (unless noCache)
                if (!noCache) {
                  const resolvedModel = config.filterModel ?? "anthropic/claude-haiku-4-5";
                  const cachedAnswer = getCached(r.url, prompt, resolvedModel, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
                  if (cachedAnswer !== null) {
                    ptcUrls.push({ url: r.url, title: r.title, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null });
                    return `Source: ${r.url}\n\n${cachedAnswer}`;
                  }
                }

                const filterResult = await filterContent(
                  r.content,
                  prompt,
                  ctx.modelRegistry,
                  config.filterModel,
                  complete
                );
                if (filterResult.filtered !== null) {
                  // Store in cache
                  putCache(r.url, prompt, filterResult.model, filterResult.filtered, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);

                  ptcUrls.push({ url: r.url, title: r.title, content: null, filtered: filterResult.filtered, filePath: null, charCount: filterResult.filtered.length, error: null });
                  return `Source: ${r.url}\n\n${filterResult.filtered}`;
                }

                // Filter failed — fallback (unchanged from existing logic)
                const reason = filterResult.reason.startsWith("No filter model available")
                  ? "No filter model available. Returning raw content."
                  : filterResult.reason;

                const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
                try {
                  const filePath = offloadToFile(fullText);
                  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
                  ptcUrls.push({ url: r.url, title: r.title, content: r.content, filtered: null, filePath, charCount: r.content.length, error: null });
                  return [
                    `# ${r.title}`,
                    `Source: ${r.url}`,
                    `⚠ ${reason}`,
                    "",
                    `${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`,
                    "",
                    `Full content saved to ${filePath} (${fullText.length} chars). Use \`read\` to explore further.`,
                  ].join("\n");
                } catch {
                  ptcUrls.push({ url: r.url, title: r.title, content: r.content, filtered: null, filePath: null, charCount: r.content.length, error: null });
                  return `⚠ Could not write temp file. Returning inline.\n\n${fullText}`;
                }
              })
            )
          );
```

The rest of the multi-URL prompt block (success count calculation, return statement) remains unchanged.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 11: index.ts: session_shutdown does not clear persistent cache [depends: 8]

### Task 11: index.ts: session_shutdown does not clear persistent cache [depends: 8]

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Add to `index.test.ts` inside the `session lifecycle` describe block:

```typescript
  it("session_shutdown does NOT call any cache-clearing function from research-cache", async () => {
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_shutdown");
    expect(handler).toBeDefined();

    await handler({});

    // research-cache has no clearCache function exported — the test validates
    // that the persistent cache module is never touched during shutdown.
    // The in-memory clearResults IS called (existing behavior), but
    // research-cache functions are not.
    expect(cacheState.getCached).not.toHaveBeenCalled();
    expect(cacheState.putCache).not.toHaveBeenCalled();
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: PASS — this should pass immediately since `handleSessionShutdown()` only calls `clearResults()` (in-memory store), not any research-cache function. This test explicitly verifies AC 7.

**Step 3 — No new implementation needed**

The existing `handleSessionShutdown()` function (line 56-62) only clears the in-memory store and resets config cache. It does not touch the persistent cache, which is the correct behavior per AC 7.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 12: research-cache.ts: disk persistence survives reload [depends: 2]

### Task 12: research-cache.ts: disk persistence survives reload [depends: 2]

**Files:**
- Modify: `research-cache.test.ts`

**Step 1 — Write the failing test**

Add to `research-cache.test.ts` inside the `getCached and putCache` describe block:

```typescript
  it("cache survives across separate getCached calls (disk persistence)", () => {
    // Write via putCache
    putCache("https://example.com", "prompt", "model", "persisted answer", 1440, cacheFilePath);

    // Read the raw file to confirm it's on disk
    const raw = readFileSync(cacheFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed)).toHaveLength(1);

    // A completely new getCached call reads from disk
    const result = getCached("https://example.com", "prompt", "model", 1440, cacheFilePath);
    expect(result).toBe("persisted answer");
  });

  it("creates parent directories if cache directory does not exist", () => {
    const deepPath = join(tempDir, "a", "b", "c", "cache.json");
    putCache("https://example.com", "prompt", "model", "deep answer", 1440, deepPath);
    const result = getCached("https://example.com", "prompt", "model", 1440, deepPath);
    expect(result).toBe("deep answer");
  });
```

Note: add `readFileSync` to the existing import from `"node:fs"` if not already present from Task 4.

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS — this should already pass because `putCache` writes to disk and `getCached` reads from disk. This task explicitly validates AC 6 (disk persistence).

**Step 3 — No new implementation needed**

The implementation from Task 2 already handles disk persistence via `readFileSync`/`writeFileSync` and `mkdirSync({ recursive: true })`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
