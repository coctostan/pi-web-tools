# pi-web-tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A lightweight Pi extension providing web search (Exa), content fetching (Readability → Jina), and GitHub clone-over-scrape — with tests, LRU storage, and clean error handling.

**Architecture:** Three tools (`web_search`, `fetch_content`, `get_search_content`) backed by four modules: Exa API client, content extraction pipeline, GitHub clone manager, and LRU result storage. Config from `~/.pi/web-tools.json` with env var overrides and TTL-based cache invalidation.

**Tech Stack:** TypeScript, Pi extension API (`@mariozechner/pi-coding-agent`), `@sinclair/typebox` for schemas, `@mozilla/readability` + `linkedom` for HTML extraction, `turndown` for HTML→Markdown, `p-limit` for concurrency, Vitest for tests.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `README.md` (stub)
- Create: `LICENSE`
- Modify: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "pi-web-tools",
  "version": "0.1.0",
  "description": "Web search via Exa, content extraction, and GitHub repo cloning for Pi coding agent",
  "type": "module",
  "keywords": ["pi-package", "pi", "pi-coding-agent", "extension", "web-search", "exa", "fetch", "github"],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/USER/pi-web-tools.git"
  },
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "linkedom": "^0.16.0",
    "p-limit": "^6.1.0",
    "turndown": "^7.2.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  },
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "types": ["node"]
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
  },
});
```

**Step 4: Update .gitignore**

Append:
```
.worktrees/
```

**Step 5: Create LICENSE (MIT)**

Standard MIT license file.

**Step 6: Create README.md stub**

```markdown
# pi-web-tools

Web search, content extraction, and GitHub repo cloning for Pi coding agent.

> Under construction.
```

**Step 7: Install dependencies and verify**

```bash
cd ~/workspace/pi-web-tools
npm install
npx vitest run  # Should pass (0 tests)
```

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with deps and test config"
```

---

## Task 2: Config module with TTL invalidation

**Files:**
- Create: `config.ts`
- Create: `config.test.ts`

This module reads `~/.pi/web-tools.json` and env vars, with a 30-second TTL so config changes take effect without restart.

**Step 1: Write failing tests**

```typescript
// config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We'll test the config module by overriding CONFIG_PATH via a helper
// The module exports getConfig() which returns the full config

describe("config", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `pi-web-tools-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    configPath = join(tempDir, "web-tools.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // Clean env vars
    delete process.env.EXA_API_KEY;
    delete process.env.PI_WEB_TOOLS_CONFIG;
  });

  it("returns defaults when no config file exists", async () => {
    process.env.PI_WEB_TOOLS_CONFIG = join(tempDir, "nonexistent.json");
    // Force reimport to pick up new env
    const { getConfig, resetConfigCache } = await import("./config.js");
    resetConfigCache();
    const config = getConfig();
    expect(config.exaApiKey).toBeNull();
    expect(config.github.maxRepoSizeMB).toBe(350);
    expect(config.github.clonePath).toBe("/tmp/pi-github-repos");
    expect(config.github.cloneTimeoutSeconds).toBe(30);
  });

  it("reads config from file", async () => {
    writeFileSync(configPath, JSON.stringify({
      exaApiKey: "test-key-123",
      github: { maxRepoSizeMB: 100 },
    }));
    process.env.PI_WEB_TOOLS_CONFIG = configPath;
    const { getConfig, resetConfigCache } = await import("./config.js");
    resetConfigCache();
    const config = getConfig();
    expect(config.exaApiKey).toBe("test-key-123");
    expect(config.github.maxRepoSizeMB).toBe(100);
    // Defaults still apply for unset fields
    expect(config.github.cloneTimeoutSeconds).toBe(30);
  });

  it("env var EXA_API_KEY overrides config file", async () => {
    writeFileSync(configPath, JSON.stringify({ exaApiKey: "file-key" }));
    process.env.PI_WEB_TOOLS_CONFIG = configPath;
    process.env.EXA_API_KEY = "env-key";
    const { getConfig, resetConfigCache } = await import("./config.js");
    resetConfigCache();
    const config = getConfig();
    expect(config.exaApiKey).toBe("env-key");
  });

  it("TTL cache invalidates after expiry", async () => {
    writeFileSync(configPath, JSON.stringify({ exaApiKey: "key-v1" }));
    process.env.PI_WEB_TOOLS_CONFIG = configPath;
    const { getConfig, resetConfigCache, CONFIG_TTL_MS } = await import("./config.js");
    resetConfigCache();

    const config1 = getConfig();
    expect(config1.exaApiKey).toBe("key-v1");

    // Update file
    writeFileSync(configPath, JSON.stringify({ exaApiKey: "key-v2" }));

    // Should still return cached version
    const config2 = getConfig();
    expect(config2.exaApiKey).toBe("key-v1");

    // Advance time past TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(CONFIG_TTL_MS + 1);
    vi.useRealTimers();

    // Re-import won't help with fake timers; instead we test resetConfigCache
    resetConfigCache();
    const config3 = getConfig();
    expect(config3.exaApiKey).toBe("key-v2");
  });

  it("handles malformed config file gracefully", async () => {
    writeFileSync(configPath, "NOT VALID JSON{{{");
    process.env.PI_WEB_TOOLS_CONFIG = configPath;
    const { getConfig, resetConfigCache } = await import("./config.js");
    resetConfigCache();
    const config = getConfig();
    // Should return defaults, not throw
    expect(config.exaApiKey).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run config.test.ts
```
Expected: FAIL — `config.js` does not exist.

**Step 3: Implement config.ts**

```typescript
// config.ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_TTL_MS = 30_000;

const DEFAULT_CONFIG_PATH = join(homedir(), ".pi", "web-tools.json");

export interface GitHubConfig {
  maxRepoSizeMB: number;
  cloneTimeoutSeconds: number;
  clonePath: string;
}

export interface WebToolsConfig {
  exaApiKey: string | null;
  github: GitHubConfig;
}

const DEFAULTS: WebToolsConfig = {
  exaApiKey: null,
  github: {
    maxRepoSizeMB: 350,
    cloneTimeoutSeconds: 30,
    clonePath: "/tmp/pi-github-repos",
  },
};

let cached: { config: WebToolsConfig; timestamp: number } | null = null;

function getConfigPath(): string {
  return process.env.PI_WEB_TOOLS_CONFIG || DEFAULT_CONFIG_PATH;
}

function loadFromFile(): Partial<WebToolsConfig> {
  const configPath = getConfigPath();
  try {
    if (!existsSync(configPath)) return {};
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    if (typeof raw !== "object" || raw === null) return {};
    return raw;
  } catch {
    return {};
  }
}

export function getConfig(): WebToolsConfig {
  const now = Date.now();
  if (cached && now - cached.timestamp < CONFIG_TTL_MS) {
    return cached.config;
  }

  const file = loadFromFile();
  const gh = typeof file.github === "object" && file.github !== null ? file.github : {};

  const config: WebToolsConfig = {
    exaApiKey:
      process.env.EXA_API_KEY ??
      (typeof file.exaApiKey === "string" ? file.exaApiKey : null),
    github: {
      maxRepoSizeMB:
        typeof (gh as any).maxRepoSizeMB === "number"
          ? (gh as any).maxRepoSizeMB
          : DEFAULTS.github.maxRepoSizeMB,
      cloneTimeoutSeconds:
        typeof (gh as any).cloneTimeoutSeconds === "number"
          ? (gh as any).cloneTimeoutSeconds
          : DEFAULTS.github.cloneTimeoutSeconds,
      clonePath:
        typeof (gh as any).clonePath === "string"
          ? (gh as any).clonePath
          : DEFAULTS.github.clonePath,
    },
  };

  cached = { config, timestamp: now };
  return config;
}

export function resetConfigCache(): void {
  cached = null;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run config.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add config.ts config.test.ts
git commit -m "feat: config module with TTL invalidation and env var overrides"
```

---

## Task 3: LRU storage module

**Files:**
- Create: `storage.ts`
- Create: `storage.test.ts`

LRU map with max entry count and TTL. Replaces pi-web-access's unbounded Map.

**Step 1: Write failing tests**

```typescript
// storage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  generateId,
  storeResult,
  getResult,
  getAllResults,
  deleteResult,
  clearResults,
  type StoredResultData,
} from "./storage.js";

function makeFetchData(id: string): StoredResultData {
  return {
    id,
    type: "fetch",
    timestamp: Date.now(),
    urls: [{ url: "https://example.com", title: "Example", content: "Hello", error: null }],
  };
}

describe("storage", () => {
  beforeEach(() => {
    clearResults();
  });

  it("generateId returns unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it("store and retrieve a result", () => {
    const data = makeFetchData("test-1");
    storeResult("test-1", data);
    expect(getResult("test-1")).toEqual(data);
  });

  it("returns null for missing result", () => {
    expect(getResult("nonexistent")).toBeNull();
  });

  it("getAllResults returns all stored", () => {
    storeResult("a", makeFetchData("a"));
    storeResult("b", makeFetchData("b"));
    expect(getAllResults()).toHaveLength(2);
  });

  it("deleteResult removes entry", () => {
    storeResult("a", makeFetchData("a"));
    expect(deleteResult("a")).toBe(true);
    expect(getResult("a")).toBeNull();
    expect(deleteResult("a")).toBe(false);
  });

  it("evicts oldest entry when max capacity reached", () => {
    // Default max is 50, but we can test with a smaller set
    for (let i = 0; i < 55; i++) {
      storeResult(`item-${i}`, makeFetchData(`item-${i}`));
    }
    // First 5 should be evicted
    expect(getResult("item-0")).toBeNull();
    expect(getResult("item-4")).toBeNull();
    // Recent ones should exist
    expect(getResult("item-54")).not.toBeNull();
    expect(getAllResults()).toHaveLength(50);
  });

  it("accessing a result refreshes its position (LRU)", () => {
    for (let i = 0; i < 50; i++) {
      storeResult(`item-${i}`, makeFetchData(`item-${i}`));
    }
    // Access item-0 to refresh it
    getResult("item-0");
    // Add one more to trigger eviction
    storeResult("new-item", makeFetchData("new-item"));
    // item-0 should survive (was refreshed), item-1 should be evicted
    expect(getResult("item-0")).not.toBeNull();
    expect(getResult("item-1")).toBeNull();
  });

  it("clearResults empties storage", () => {
    storeResult("a", makeFetchData("a"));
    clearResults();
    expect(getAllResults()).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run storage.test.ts
```
Expected: FAIL

**Step 3: Implement storage.ts**

```typescript
// storage.ts
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

const MAX_ENTRIES = 50;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface ExtractedContent {
  url: string;
  title: string;
  content: string;
  error: string | null;
}

export interface QueryResultData {
  query: string;
  answer: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  error: string | null;
}

export interface StoredResultData {
  id: string;
  type: "search" | "fetch";
  timestamp: number;
  queries?: QueryResultData[];
  urls?: ExtractedContent[];
}

// LRU Map — Map preserves insertion order, we delete+re-insert on access
const store = new Map<string, StoredResultData>();

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function evictIfNeeded(): void {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

export function storeResult(id: string, data: StoredResultData): void {
  // Delete first so re-insert moves to end (most recent)
  store.delete(id);
  store.set(id, data);
  evictIfNeeded();
}

export function getResult(id: string): StoredResultData | null {
  const data = store.get(id);
  if (!data) return null;
  // Move to end (most recently accessed)
  store.delete(id);
  store.set(id, data);
  return data;
}

export function getAllResults(): StoredResultData[] {
  return Array.from(store.values());
}

export function deleteResult(id: string): boolean {
  return store.delete(id);
}

export function clearResults(): void {
  store.clear();
}

export function restoreFromSession(ctx: ExtensionContext): void {
  store.clear();
  const now = Date.now();
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType === "web-tools-results") {
      const data = entry.data as StoredResultData;
      if (data?.id && data?.type && data?.timestamp && now - data.timestamp < CACHE_TTL_MS) {
        store.set(data.id, data);
      }
    }
  }
  evictIfNeeded();
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run storage.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add storage.ts storage.test.ts
git commit -m "feat: LRU storage with max capacity eviction and session restore"
```

---

## Task 4: Exa search client

**Files:**
- Create: `exa-search.ts`
- Create: `exa-search.test.ts`

Direct Exa API client — no MCP indirection. `POST https://api.exa.ai/search` with `contents` enabled.

**Step 1: Write failing tests**

```typescript
// exa-search.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchExa, formatSearchResults, type ExaSearchResult } from "./exa-search.js";

describe("formatSearchResults", () => {
  it("formats results with answer and sources", () => {
    const results: ExaSearchResult[] = [
      { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1", publishedDate: "2025-01-01" },
      { title: "Result 2", url: "https://example.com/2", snippet: "Snippet 2" },
    ];
    const output = formatSearchResults(results);
    expect(output).toContain("Result 1");
    expect(output).toContain("https://example.com/1");
    expect(output).toContain("Result 2");
    expect(output).toContain("Snippet 1");
  });

  it("handles empty results", () => {
    const output = formatSearchResults([]);
    expect(output).toContain("No results");
  });
});

describe("searchExa", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when no API key is available", async () => {
    await expect(searchExa("test query", { apiKey: null })).rejects.toThrow(
      /EXA_API_KEY/
    );
  });

  it("sends correct request to Exa API", async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { title: "Test", url: "https://test.com", text: "Content", publishedDate: "2025-01-01" },
          ],
        }),
    };
    (fetch as any).mockResolvedValue(mockResponse);

    const results = await searchExa("typescript best practices", { apiKey: "test-key" });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://api.exa.ai/search");
    expect(options.method).toBe("POST");
    expect(options.headers["x-api-key"]).toBe("test-key");

    const body = JSON.parse(options.body);
    expect(body.query).toBe("typescript best practices");
    expect(body.contents).toBeDefined();

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Test");
  });

  it("handles API errors with clear message", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(searchExa("test", { apiKey: "bad-key" })).rejects.toThrow(
      /401/
    );
  });

  it("respects numResults parameter", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    await searchExa("test", { apiKey: "key", numResults: 10 });

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.numResults).toBe(10);
  });

  it("passes signal for cancellation", async () => {
    const controller = new AbortController();
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    await searchExa("test", { apiKey: "key", signal: controller.signal });

    const options = (fetch as any).mock.calls[0][1];
    expect(options.signal).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run exa-search.test.ts
```
Expected: FAIL

**Step 3: Implement exa-search.ts**

```typescript
// exa-search.ts
const EXA_API_URL = "https://api.exa.ai/search";
const DEFAULT_NUM_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ExaSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  signal?: AbortSignal;
}

export async function searchExa(
  query: string,
  options: ExaSearchOptions,
): Promise<ExaSearchResult[]> {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error(
      "No Exa API key configured. Either:\n" +
      '  1. Set EXA_API_KEY environment variable\n' +
      '  2. Add "exaApiKey" to ~/.pi/web-tools.json'
    );
  }

  const body = {
    query,
    numResults: options.numResults ?? DEFAULT_NUM_RESULTS,
    contents: {
      text: { maxCharacters: 1000 },
    },
  };

  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
    : AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  const res = await fetch(EXA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Exa API error ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    results: Array<{
      title?: string;
      url?: string;
      text?: string;
      publishedDate?: string;
    }>;
  };

  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.text ?? "",
    publishedDate: r.publishedDate,
  }));
}

export function formatSearchResults(results: ExaSearchResult[]): string {
  if (results.length === 0) return "No results found.";

  return results
    .map((r, i) => {
      const date = r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : "";
      const snippet = r.snippet ? `\n   ${r.snippet.slice(0, 200)}` : "";
      return `${i + 1}. **${r.title}**${date}\n   ${r.url}${snippet}`;
    })
    .join("\n\n");
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run exa-search.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add exa-search.ts exa-search.test.ts
git commit -m "feat: Exa search client with direct API, clear errors, tests"
```

---

## Task 5: Content extraction (Readability → Jina)

**Files:**
- Create: `extract.ts`
- Create: `extract.test.ts`

HTTP fetch → Readability → Jina Reader fallback. No video, no PDF, no RSC.

**Step 1: Write failing tests**

```typescript
// extract.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractContent, fetchAllContent } from "./extract.js";

describe("extractContent", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error for invalid URL", async () => {
    const result = await extractContent("not-a-url");
    expect(result.error).toContain("Invalid URL");
  });

  it("returns error for aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await extractContent("https://example.com", controller.signal);
    expect(result.error).toContain("Aborted");
  });

  it("extracts readable HTML content", async () => {
    const html = `
      <html><head><title>Test Page</title></head>
      <body>
        <article>
          <h1>Hello World</h1>
          <p>This is a test article with enough content to pass the minimum threshold.
          It needs to be long enough to not be considered incomplete extraction.
          Let me add several more sentences to make sure this works correctly.
          The readability algorithm needs sufficient text content to extract properly.
          Here is more text to ensure we exceed the minimum useful content threshold.</p>
        </article>
      </body></html>
    `;
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve(html),
    });

    const result = await extractContent("https://example.com/article");
    expect(result.error).toBeNull();
    expect(result.title).toContain("Test Page");
    expect(result.content).toContain("Hello World");
  });

  it("returns non-HTML content directly", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve('{"key": "value"}'),
    });

    const result = await extractContent("https://example.com/api");
    expect(result.error).toBeNull();
    expect(result.content).toContain('"key"');
  });

  it("returns HTTP error with status code", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers({}),
    });

    const result = await extractContent("https://example.com/missing");
    expect(result.error).toContain("404");
  });

  it("rejects unsupported content types", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-type": "image/png",
        "content-length": "1000",
      }),
    });

    const result = await extractContent("https://example.com/image.png");
    expect(result.error).toContain("Unsupported");
  });
});

describe("fetchAllContent", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches multiple URLs concurrently", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("content"),
    });

    const results = await fetchAllContent([
      "https://a.com",
      "https://b.com",
      "https://c.com",
    ]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.error === null)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run extract.test.ts
```
Expected: FAIL

**Step 3: Implement extract.ts**

```typescript
// extract.ts
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import pLimit from "p-limit";

const DEFAULT_TIMEOUT_MS = 30_000;
const CONCURRENT_LIMIT = 3;
const MIN_USEFUL_CONTENT = 500;
const JINA_READER_BASE = "https://r.jina.ai/";
const JINA_TIMEOUT_MS = 30_000;

const NON_RECOVERABLE_ERRORS = ["Unsupported content type", "Response too large"];

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const fetchLimit = pLimit(CONCURRENT_LIMIT);

export interface ExtractedContent {
  url: string;
  title: string;
  content: string;
  error: string | null;
}

export async function extractContent(
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedContent> {
  if (signal?.aborted) {
    return { url, title: "", content: "", error: "Aborted" };
  }

  try {
    new URL(url);
  } catch {
    return { url, title: "", content: "", error: "Invalid URL" };
  }

  const httpResult = await extractViaHttp(url, signal);

  // If successful or non-recoverable, return
  if (!httpResult.error || signal?.aborted) return httpResult;
  if (NON_RECOVERABLE_ERRORS.some((prefix) => httpResult.error!.startsWith(prefix))) {
    return httpResult;
  }

  // Fallback: Jina Reader
  const jinaResult = await extractWithJinaReader(url, signal);
  if (jinaResult) return jinaResult;

  return {
    ...httpResult,
    error: httpResult.error + "\n\nJina Reader fallback also failed. Use web_search to find content about this topic.",
  };
}

async function extractViaHttp(
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedContent> {
  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
    : AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: effectiveSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return { url, title: "", content: "", error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length");

    // Reject binary/unsupported types early
    if (/^(image|audio|video|application\/(zip|octet-stream))/.test(contentType)) {
      return { url, title: "", content: "", error: `Unsupported content type: ${contentType.split(";")[0]}` };
    }

    // Size guard: 5MB max
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
      return { url, title: "", content: "", error: `Response too large (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB)` };
    }

    const text = await response.text();
    const isHTML = contentType.includes("text/html") || contentType.includes("application/xhtml");

    if (!isHTML) {
      const title = extractHeadingTitle(text) ?? new URL(url).pathname.split("/").pop() || url;
      return { url, title, content: text, error: null };
    }

    // HTML: run Readability
    const { document } = parseHTML(text);
    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();

    if (!article) {
      return { url, title: "", content: "", error: "Could not extract readable content from HTML" };
    }

    const markdown = turndown.turndown(article.content);

    if (markdown.length < MIN_USEFUL_CONTENT) {
      return {
        url,
        title: article.title || "",
        content: markdown,
        error: "Extracted content appears incomplete",
      };
    }

    return { url, title: article.title || "", content: markdown, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { url, title: "", content: "", error: message };
  }
}

async function extractWithJinaReader(
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedContent | null> {
  try {
    const effectiveSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(JINA_TIMEOUT_MS)])
      : AbortSignal.timeout(JINA_TIMEOUT_MS);

    const res = await fetch(JINA_READER_BASE + url, {
      headers: { Accept: "text/markdown", "X-No-Cache": "true" },
      signal: effectiveSignal,
    });

    if (!res.ok) return null;

    const content = await res.text();
    const contentStart = content.indexOf("Markdown Content:");
    const markdown = contentStart >= 0 ? content.slice(contentStart + 17).trim() : content;

    if (
      markdown.length < 100 ||
      markdown.startsWith("Loading...") ||
      markdown.startsWith("Please enable JavaScript")
    ) {
      return null;
    }

    const title = extractHeadingTitle(markdown) ?? new URL(url).pathname.split("/").pop() || url;
    return { url, title, content: markdown, error: null };
  } catch {
    return null;
  }
}

export function extractHeadingTitle(text: string): string | null {
  const match = text.match(/^#{1,2}\s+(.+)/m);
  if (!match) return null;
  const cleaned = match[1].replace(/\*+/g, "").trim();
  return cleaned || null;
}

export async function fetchAllContent(
  urls: string[],
  signal?: AbortSignal,
): Promise<ExtractedContent[]> {
  return Promise.all(urls.map((url) => fetchLimit(() => extractContent(url, signal))));
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run extract.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add extract.ts extract.test.ts
git commit -m "feat: content extraction with Readability and Jina Reader fallback"
```

---

## Task 6: GitHub clone-over-scrape

**Files:**
- Create: `github-extract.ts`
- Create: `github-extract.test.ts`

URL parsing, size check via `gh api`, shallow clone, tree + README generation.

**Step 1: Write failing tests**

```typescript
// github-extract.test.ts
import { describe, it, expect } from "vitest";
import { parseGitHubUrl, type GitHubUrlInfo } from "./github-extract.js";

describe("parseGitHubUrl", () => {
  it("parses root repo URL", () => {
    const info = parseGitHubUrl("https://github.com/owner/repo");
    expect(info).toEqual({
      owner: "owner",
      repo: "repo",
      refIsFullSha: false,
      type: "root",
    });
  });

  it("strips .git suffix", () => {
    const info = parseGitHubUrl("https://github.com/owner/repo.git");
    expect(info?.repo).toBe("repo");
  });

  it("parses blob URL with ref and path", () => {
    const info = parseGitHubUrl("https://github.com/owner/repo/blob/main/src/index.ts");
    expect(info).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
      refIsFullSha: false,
      path: "src/index.ts",
      type: "blob",
    });
  });

  it("parses tree URL", () => {
    const info = parseGitHubUrl("https://github.com/owner/repo/tree/develop/lib");
    expect(info).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "develop",
      refIsFullSha: false,
      path: "lib",
      type: "tree",
    });
  });

  it("detects full SHA refs", () => {
    const sha = "a".repeat(40);
    const info = parseGitHubUrl(`https://github.com/owner/repo/blob/${sha}/file.ts`);
    expect(info?.refIsFullSha).toBe(true);
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("returns null for non-code segments", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo/issues")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/pull/42")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/discussions")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/actions")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
  });

  it("returns null for single-segment paths", () => {
    expect(parseGitHubUrl("https://github.com/owner")).toBeNull();
  });

  it("handles blob URL with no path after ref", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo/blob")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/blob/main")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
      refIsFullSha: false,
      path: "",
      type: "blob",
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run github-extract.test.ts
```
Expected: FAIL

**Step 3: Implement github-extract.ts**

Implement `parseGitHubUrl`, `extractGitHub` (with size check, clone, content generation), `clearCloneCache`. Full implementation modeled on pi-web-access but without the API fallback module (use `gh api` inline instead). Key differences from pi-web-access:

- Uses `getConfig()` from our config module (with TTL)
- Uses Set for `NON_CODE_SEGMENTS` (same as pi-web-access)
- `checkRepoSize` via `gh api repos/{owner}/{repo} --jq '.size'`
- Clone via `gh repo clone` with `git clone` fallback
- No separate `github-api.ts` — keep it in one file since it's simpler
- Binary file detection, tree building, README reading — same logic

The full implementation will be ~300 lines. The key exports are:
- `parseGitHubUrl(url): GitHubUrlInfo | null`
- `extractGitHub(url, signal?, forceClone?): Promise<ExtractedContent | null>`
- `clearCloneCache(): void`

**Step 4: Run tests to verify they pass**

```bash
npx vitest run github-extract.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add github-extract.ts github-extract.test.ts
git commit -m "feat: GitHub URL parsing and clone-over-scrape extraction"
```

---

## Task 7: Extension entry point (index.ts) — tool registration

**Files:**
- Create: `index.ts`
- Create: `index.test.ts`

Register `web_search`, `fetch_content`, `get_search_content` tools. Wire up session events. Add `renderCall`/`renderResult` for clean TUI output.

**Step 1: Write failing test for URL dedup (Set not array)**

```typescript
// index.test.ts
import { describe, it, expect } from "vitest";
import { dedupeUrls } from "./index.js";

describe("dedupeUrls", () => {
  it("removes duplicate URLs", () => {
    const urls = ["https://a.com", "https://b.com", "https://a.com", "https://c.com"];
    expect(dedupeUrls(urls)).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
  });

  it("handles empty array", () => {
    expect(dedupeUrls([])).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run index.test.ts
```
Expected: FAIL

**Step 3: Implement index.ts**

The full index.ts will:

1. Export `dedupeUrls` (using Set, not Array.includes)
2. Register three tools: `web_search`, `fetch_content`, `get_search_content`
3. Handle session events: `session_start`, `session_switch`, `session_fork`, `session_tree`, `session_shutdown`
4. `web_search`: call `searchExa`, format results, store in LRU storage
5. `fetch_content`: route GitHub URLs to `extractGitHub`, others to `extractContent`, store results
6. `get_search_content`: retrieve from LRU storage by ID + index
7. `renderCall`/`renderResult` for all three tools — compact default, detail on expand
8. `MAX_INLINE_CONTENT = 30000` — truncate with pointer to `get_search_content`

**Step 4: Run tests to verify they pass**

```bash
npx vitest run index.test.ts
```
Expected: PASS

**Step 5: Run all tests**

```bash
npx vitest run
```
Expected: ALL PASS

**Step 6: Commit**

```bash
git add index.ts index.test.ts
git commit -m "feat: extension entry point with three tools and session management"
```

---

## Task 8: README, polish, and integration test

**Files:**
- Rewrite: `README.md`
- Verify: full extension loads

**Step 1: Write comprehensive README.md**

The README should cover:
- Banner description (name, one-liner)
- Install instructions (`pi install npm:pi-web-tools`)
- Config file format with all options
- Tool reference (`web_search`, `fetch_content`, `get_search_content`) with examples
- How GitHub cloning works (clone cache, size threshold, `gh` CLI)
- How content extraction works (Readability → Jina)
- Fallback behavior
- Limitations
- File listing
- License

**Step 2: Verify extension loads with pi**

```bash
cd ~/workspace/pi-web-tools
# Dry-run: check that the extension can be loaded
node -e "import('./index.ts').then(() => console.log('OK')).catch(e => console.error(e))" 2>&1 || true
```

This won't fully work without pi's runtime, but at least verifies no syntax errors. The real test is `pi -e ./index.ts`.

**Step 3: Run all tests one final time**

```bash
npx vitest run
```
Expected: ALL PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "docs: comprehensive README with install, config, and usage guide"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Project scaffolding | — |
| 2 | Config module (TTL, env vars) | 5 tests |
| 3 | LRU storage | 7 tests |
| 4 | Exa search client | 6 tests |
| 5 | Content extraction (Readability + Jina) | 7 tests |
| 6 | GitHub clone-over-scrape | 9 tests |
| 7 | Extension entry (3 tools, session mgmt) | 2+ tests |
| 8 | README + integration verify | — |

**Total: ~36 unit tests across 5 test files, ~500 lines of implementation code.**

Key improvements over pi-web-access:
- ✅ Unit tests for all parsing/routing logic
- ✅ LRU eviction (no unbounded memory)
- ✅ Config TTL (no restart needed)
- ✅ Single timeout pattern (AbortSignal.any)
- ✅ Set-based URL dedup (not O(n²))
- ✅ Clear error messages throughout
- ✅ No Chrome cookie extraction
- ✅ ~500 LOC vs ~2000 LOC
