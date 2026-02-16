# Exa API Expansion Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Expand pi-web-tools with enhanced `web_search` parameters (type, category, domain filtering, highlights), a new `code_search` tool wrapping Exa's Context API, and per-tool config toggles.

**Architecture:** Three independent feature areas layered bottom-up: (1) config gets tool toggles, (2) `exa-search.ts` gains new search params and switches to highlights, (3) new `exa-context.ts` wraps `/context`, (4) `index.ts` wires conditional registration and the new tool. Each layer is tested before the next.

**Tech Stack:** TypeScript, Vitest, raw `fetch` for Exa API, Typebox for schemas, pi extension API.

---

## Phase 1: Config Tool Toggles

### Task 1: Add tool toggle types and parsing to config

**Files:**
- Modify: `config.ts`
- Test: `config.test.ts`

**Step 1: Write failing tests for tool toggles**

Add these tests to `config.test.ts` inside the existing `describe("config", ...)` block, after the last `it(...)`:

```typescript
it("defaults all tools to true when tools block is missing", () => {
  writeFileSync(configPath, JSON.stringify({}));
  resetConfigCache();
  const config = getConfig();
  expect(config.tools.web_search).toBe(true);
  expect(config.tools.code_search).toBe(true);
  expect(config.tools.fetch_content).toBe(true);
  expect(config.tools.get_search_content).toBe(true);
});

it("respects explicit tool toggle values", () => {
  writeFileSync(configPath, JSON.stringify({
    tools: { web_search: false, code_search: false }
  }));
  resetConfigCache();
  const config = getConfig();
  expect(config.tools.web_search).toBe(false);
  expect(config.tools.code_search).toBe(false);
  expect(config.tools.fetch_content).toBe(true);
  expect(config.tools.get_search_content).toBe(true);
});

it("auto-disables get_search_content when both web_search and code_search are disabled", () => {
  writeFileSync(configPath, JSON.stringify({
    tools: { web_search: false, code_search: false, get_search_content: true }
  }));
  resetConfigCache();
  const config = getConfig();
  expect(config.tools.get_search_content).toBe(false);
});

it("keeps get_search_content enabled when at least one search tool is on", () => {
  writeFileSync(configPath, JSON.stringify({
    tools: { web_search: false, code_search: true }
  }));
  resetConfigCache();
  const config = getConfig();
  expect(config.tools.get_search_content).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run config.test.ts`
Expected: FAIL — `config.tools` does not exist on type `WebToolsConfig`

**Step 3: Implement tool toggle config**

In `config.ts`, add the `ToolToggles` interface and update `WebToolsConfig`:

```typescript
export interface ToolToggles {
  web_search: boolean;
  code_search: boolean;
  fetch_content: boolean;
  get_search_content: boolean;
}

export interface WebToolsConfig {
  exaApiKey: string | null;
  github: GitHubConfig;
  tools: ToolToggles;
}
```

Update `DEFAULT_CONFIG`:

```typescript
const DEFAULT_CONFIG: WebToolsConfig = {
  exaApiKey: null,
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
};
```

In `buildConfig()`, after the `exaApiKey` resolution block, add tool toggle parsing:

```typescript
const fileTools = (file["tools"] && typeof file["tools"] === "object" && !Array.isArray(file["tools"]))
  ? file["tools"] as Record<string, unknown>
  : {};

const tools: ToolToggles = {
  web_search: typeof fileTools["web_search"] === "boolean" ? fileTools["web_search"] : DEFAULT_CONFIG.tools.web_search,
  code_search: typeof fileTools["code_search"] === "boolean" ? fileTools["code_search"] : DEFAULT_CONFIG.tools.code_search,
  fetch_content: typeof fileTools["fetch_content"] === "boolean" ? fileTools["fetch_content"] : DEFAULT_CONFIG.tools.fetch_content,
  get_search_content: typeof fileTools["get_search_content"] === "boolean" ? fileTools["get_search_content"] : DEFAULT_CONFIG.tools.get_search_content,
};

// Auto-disable get_search_content if both search tools are off
if (!tools.web_search && !tools.code_search) {
  tools.get_search_content = false;
}

return { exaApiKey, github, tools };
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run config.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add config.ts config.test.ts
git commit -m "feat: add tool toggle config with auto-disable logic"
```

---

## Phase 2: Enhanced `web_search`

### Task 2: Add new parameters to `searchExa` and switch to highlights

**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`

**Step 1: Write failing tests for new search params and highlights**

Add these tests inside the existing `describe("searchExa", ...)` block in `exa-search.test.ts`:

```typescript
it("sends type parameter when provided", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test", { apiKey: "key", type: "deep" });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.type).toBe("keyword");
});

it("maps type 'auto' to omitting type from body", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test", { apiKey: "key", type: "auto" });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.type).toBeUndefined();
});

it("maps type 'instant' to 'keyword' and 'deep' to 'keyword'", async () => {
  // "instant" -> keyword
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
  await searchExa("test", { apiKey: "key", type: "instant" });
  let body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.type).toBe("keyword");

  // "deep" -> keyword
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
  await searchExa("test", { apiKey: "key", type: "deep" });
  body = JSON.parse(mockFetch.mock.calls[1][1].body);
  expect(body.type).toBe("keyword");
});

it("sends category parameter when provided", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test", { apiKey: "key", category: "news" });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.category).toBe("news");
});

it("sends includeDomains and excludeDomains when provided", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test", {
    apiKey: "key",
    includeDomains: ["github.com"],
    excludeDomains: ["pinterest.com"],
  });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.includeDomains).toEqual(["github.com"]);
  expect(body.excludeDomains).toEqual(["pinterest.com"]);
});

it("uses highlights content mode with maxCharacters 2000", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test", { apiKey: "key" });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.contents).toEqual({ highlights: { numSentences: 3, highlightsPerUrl: 3 } });
  expect(body.contents.text).toBeUndefined();
});

it("parses highlights response into snippet", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Highlights Result",
          url: "https://example.com",
          highlights: ["First highlight.", "Second highlight."],
          publishedDate: "2025-01-01",
        },
      ],
    }),
  });

  const results = await searchExa("test", { apiKey: "key" });
  expect(results).toHaveLength(1);
  expect(results[0].snippet).toBe("First highlight. Second highlight.");
  expect(results[0].title).toBe("Highlights Result");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run exa-search.test.ts`
Expected: FAIL — `type`, `category`, `includeDomains`, `excludeDomains` not in `ExaSearchOptions`; content body still uses `text`

**Step 3: Implement enhanced searchExa**

In `exa-search.ts`, update `ExaSearchOptions`:

```typescript
export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  type?: "auto" | "instant" | "deep";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
}
```

Update the `searchExa` function body. Replace the `body` construction:

```typescript
const requestBody: Record<string, unknown> = {
  query,
  numResults,
  contents: { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
};

// Map type: "auto" -> omit, "instant" | "deep" -> "keyword"
if (options.type && options.type !== "auto") {
  requestBody.type = "keyword";
}
if (options.category) {
  requestBody.category = options.category;
}
if (options.includeDomains && options.includeDomains.length > 0) {
  requestBody.includeDomains = options.includeDomains;
}
if (options.excludeDomains && options.excludeDomains.length > 0) {
  requestBody.excludeDomains = options.excludeDomains;
}

const body = JSON.stringify(requestBody);
```

Update `parseExaResults` to handle highlights. Change the `ExaRawResult` type:

```typescript
type ExaRawResult = {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  highlights?: unknown;
  publishedDate?: unknown;
};
```

In the `return raw.map(...)` callback, change the `snippet` line:

```typescript
snippet: Array.isArray(r.highlights)
  ? r.highlights.filter((h): h is string => typeof h === "string").join(" ")
  : typeof r.text === "string" ? r.text : "",
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run exa-search.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add exa-search.ts exa-search.test.ts
git commit -m "feat: enhanced web_search with type/category/domains and highlights"
```

---

### Task 3: Add new parameter validation for web_search

**Files:**
- Modify: `tool-params.ts`
- Test: `tool-params.test.ts`

**Step 1: Write failing tests for new web_search param normalization**

Add these tests inside the existing `describe("tool-params", ...)` block:

```typescript
it("normalizeWebSearchInput passes through type when valid", () => {
  const result = normalizeWebSearchInput({ query: "x", type: "deep" });
  expect(result.type).toBe("deep");
});

it("normalizeWebSearchInput defaults type to undefined", () => {
  const result = normalizeWebSearchInput({ query: "x" });
  expect(result.type).toBeUndefined();
});

it("normalizeWebSearchInput ignores invalid type", () => {
  const result = normalizeWebSearchInput({ query: "x", type: "invalid" });
  expect(result.type).toBeUndefined();
});

it("normalizeWebSearchInput passes through category when valid", () => {
  const result = normalizeWebSearchInput({ query: "x", category: "news" });
  expect(result.category).toBe("news");
});

it("normalizeWebSearchInput ignores invalid category", () => {
  const result = normalizeWebSearchInput({ query: "x", category: 123 });
  expect(result.category).toBeUndefined();
});

it("normalizeWebSearchInput passes through includeDomains array", () => {
  const result = normalizeWebSearchInput({ query: "x", includeDomains: ["github.com"] });
  expect(result.includeDomains).toEqual(["github.com"]);
});

it("normalizeWebSearchInput filters non-string entries from domain arrays", () => {
  const result = normalizeWebSearchInput({ query: "x", includeDomains: ["a.com", 123, null] });
  expect(result.includeDomains).toEqual(["a.com"]);
});

it("normalizeWebSearchInput passes through excludeDomains array", () => {
  const result = normalizeWebSearchInput({ query: "x", excludeDomains: ["pinterest.com"] });
  expect(result.excludeDomains).toEqual(["pinterest.com"]);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tool-params.test.ts`
Expected: FAIL — returned object has no `type`, `category`, `includeDomains`, `excludeDomains` keys

**Step 3: Implement extended normalizeWebSearchInput**

In `tool-params.ts`, update the `normalizeWebSearchInput` function signature and body. Replace the entire function:

```typescript
const VALID_SEARCH_TYPES = new Set(["auto", "instant", "deep"]);
const VALID_CATEGORIES = new Set([
  "company", "research paper", "news", "tweet",
  "people", "personal site", "financial report", "pdf",
]);

export function normalizeWebSearchInput(params: {
  query?: unknown;
  queries?: unknown;
  numResults?: unknown;
  type?: unknown;
  category?: unknown;
  includeDomains?: unknown;
  excludeDomains?: unknown;
}) {
  const query = typeof params.query === "string" ? params.query : undefined;
  const queries = Array.isArray(params.queries)
    ? params.queries.filter((q): q is string => typeof q === "string")
    : undefined;

  const queryList = (queries && queries.length > 0) ? queries : (query ? [query] : []);
  if (queryList.length === 0) {
    throw new Error("Either 'query' or 'queries' must be provided.");
  }

  const numResults = typeof params.numResults === "number" && Number.isFinite(params.numResults)
    ? params.numResults
    : undefined;

  const type = typeof params.type === "string" && VALID_SEARCH_TYPES.has(params.type)
    ? params.type as "auto" | "instant" | "deep"
    : undefined;

  const category = typeof params.category === "string" && VALID_CATEGORIES.has(params.category)
    ? params.category
    : undefined;

  const includeDomains = Array.isArray(params.includeDomains)
    ? params.includeDomains.filter((d): d is string => typeof d === "string")
    : undefined;

  const excludeDomains = Array.isArray(params.excludeDomains)
    ? params.excludeDomains.filter((d): d is string => typeof d === "string")
    : undefined;

  return { queries: queryList, numResults, type, category, includeDomains, excludeDomains };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tool-params.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add tool-params.ts tool-params.test.ts
git commit -m "feat: validate new web_search params in tool-params"
```

---

### Task 4: Update web_search tool schema and wiring in index.ts

**Files:**
- Modify: `index.ts`

**Step 1: Update the WebSearchParams schema**

Replace the `WebSearchParams` const:

```typescript
const WebSearchParams = Type.Object({
  query: Type.Optional(Type.String({ description: "Single search query" })),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Multiple queries (batch)" })),
  numResults: Type.Optional(Type.Number({ description: "Results per query (default: 5, max: 20)" })),
  type: Type.Optional(Type.Union([
    Type.Literal("auto"),
    Type.Literal("instant"),
    Type.Literal("deep"),
  ], { description: 'Search type (default: "auto")' })),
  category: Type.Optional(Type.Union([
    Type.Literal("company"),
    Type.Literal("research paper"),
    Type.Literal("news"),
    Type.Literal("tweet"),
    Type.Literal("people"),
    Type.Literal("personal site"),
    Type.Literal("financial report"),
    Type.Literal("pdf"),
  ], { description: "Filter by content category" })),
  includeDomains: Type.Optional(Type.Array(Type.String(), { description: 'Only include these domains (e.g. ["github.com"])' })),
  excludeDomains: Type.Optional(Type.Array(Type.String(), { description: 'Exclude these domains (e.g. ["pinterest.com"])' })),
});
```

**Step 2: Update the web_search tool description**

Replace the `description` in the `web_search` `registerTool` call:

```typescript
description:
  "Search the web for pages matching a query. Returns highlights (short relevant excerpts), not full page content. Use `fetch_content` to read a page in full. Supports batch searching with multiple queries.",
```

**Step 3: Pass new params through to searchExa**

In the `web_search` `execute` function, update the destructuring and the `searchExa` call.

Replace:
```typescript
const { queries: queryList, numResults } = normalizeWebSearchInput(params);
```
With:
```typescript
const { queries: queryList, numResults, type, category, includeDomains, excludeDomains } = normalizeWebSearchInput(params);
```

In the `searchExa` call inside the `for` loop, add the new fields:
```typescript
const searchResults = await searchExa(q, {
  apiKey: config.exaApiKey,
  numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
  type,
  category,
  includeDomains,
  excludeDomains,
  signal: combinedSignal,
});
```

**Step 4: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add index.ts
git commit -m "feat: wire enhanced web_search params through schema and execute"
```

---

## Phase 2: New `code_search` Tool

### Task 5: Create exa-context module

**Files:**
- Create: `exa-context.ts`
- Create: `exa-context.test.ts`

**Step 1: Write failing tests for searchContext**

Create `exa-context.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchContext, type ExaContextResult } from "./exa-context.js";

describe("exa-context", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when apiKey is null", async () => {
    await expect(searchContext("test", { apiKey: null })).rejects.toThrow("EXA_API_KEY");
  });

  it("sends correct request to Exa Context API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: "some markdown content" }),
    });

    await searchContext("react hooks", { apiKey: "test-key" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.exa.ai/context");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("test-key");

    const body = JSON.parse(init.body);
    expect(body.query).toBe("react hooks");
    expect(body.tokensNum).toBe("dynamic");
  });

  it("sends numeric tokensNum when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: "content" }),
    });

    await searchContext("test", { apiKey: "key", tokensNum: 3000 });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tokensNum).toBe(3000);
  });

  it("returns markdown content from response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: "## Example\n\n```ts\nconst x = 1;\n```\n\nSource: https://github.com/example",
      }),
    });

    const result = await searchContext("test", { apiKey: "key" });
    expect(result.content).toContain("## Example");
    expect(result.content).toContain("const x = 1");
    expect(result.query).toBe("test");
  });

  it("handles API errors with status code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad request",
    });

    await expect(searchContext("test", { apiKey: "key" })).rejects.toThrow("400");
  });

  it("wraps network errors with query context", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ENOTFOUND"));

    await expect(searchContext("my code query", { apiKey: "key" }))
      .rejects.toThrow(/Context request failed.*my code query/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run exa-context.test.ts`
Expected: FAIL — module `./exa-context.js` not found

**Step 3: Implement exa-context module**

Create `exa-context.ts`:

```typescript
export interface ExaContextResult {
  query: string;
  content: string;
}

export interface ExaContextOptions {
  apiKey: string | null;
  tokensNum?: number;
  signal?: AbortSignal;
}

const EXA_CONTEXT_URL = "https://api.exa.ai/context";
const DEFAULT_TIMEOUT_MS = 30_000;

export async function searchContext(query: string, options: ExaContextOptions): Promise<ExaContextResult> {
  if (options.apiKey === null) {
    throw new Error(
      "Exa API key not configured. Set the EXA_API_KEY environment variable or add \"exaApiKey\" to ~/.pi/web-tools.json"
    );
  }

  const signals: AbortSignal[] = [AbortSignal.timeout(DEFAULT_TIMEOUT_MS)];
  if (options.signal) {
    signals.push(options.signal);
  }
  const signal = AbortSignal.any(signals);

  const body = JSON.stringify({
    query,
    tokensNum: options.tokensNum ?? "dynamic",
  });

  let response: Response;
  try {
    response = await fetch(EXA_CONTEXT_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Context request failed for query "${query}": ${msg}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Exa Context API error (${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const content = typeof data?.results === "string" ? data.results : "";

  return { query, content };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run exa-context.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add exa-context.ts exa-context.test.ts
git commit -m "feat: add exa-context module for Context API"
```

---

### Task 6: Add code_search parameter validation

**Files:**
- Modify: `tool-params.ts`
- Test: `tool-params.test.ts`

**Step 1: Write failing tests for normalizeCodeSearchInput**

Add these tests inside the existing `describe("tool-params", ...)` block:

```typescript
it("normalizeCodeSearchInput requires query", () => {
  expect(() => normalizeCodeSearchInput({})).toThrow(/'query' must be provided/);
});

it("normalizeCodeSearchInput accepts query string", () => {
  const result = normalizeCodeSearchInput({ query: "react hooks" });
  expect(result.query).toBe("react hooks");
  expect(result.tokensNum).toBeUndefined();
});

it("normalizeCodeSearchInput passes through valid tokensNum", () => {
  const result = normalizeCodeSearchInput({ query: "x", tokensNum: 5000 });
  expect(result.tokensNum).toBe(5000);
});

it("normalizeCodeSearchInput clamps tokensNum to valid range", () => {
  expect(normalizeCodeSearchInput({ query: "x", tokensNum: 10 }).tokensNum).toBe(50);
  expect(normalizeCodeSearchInput({ query: "x", tokensNum: 200000 }).tokensNum).toBe(100000);
});

it("normalizeCodeSearchInput ignores non-number tokensNum", () => {
  const result = normalizeCodeSearchInput({ query: "x", tokensNum: "big" });
  expect(result.tokensNum).toBeUndefined();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tool-params.test.ts`
Expected: FAIL — `normalizeCodeSearchInput` is not exported

**Step 3: Implement normalizeCodeSearchInput**

Add this function to `tool-params.ts`:

```typescript
export function normalizeCodeSearchInput(params: {
  query?: unknown;
  tokensNum?: unknown;
}) {
  const query = typeof params.query === "string" ? params.query : undefined;
  if (!query) {
    throw new Error("'query' must be provided.");
  }

  let tokensNum: number | undefined;
  if (typeof params.tokensNum === "number" && Number.isFinite(params.tokensNum)) {
    tokensNum = Math.max(50, Math.min(100000, Math.round(params.tokensNum)));
  }

  return { query, tokensNum };
}
```

Update the import in `tool-params.test.ts` to include `normalizeCodeSearchInput`:

```typescript
import { normalizeWebSearchInput, normalizeFetchContentInput, normalizeCodeSearchInput, dedupeUrls } from "./tool-params.js";
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tool-params.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add tool-params.ts tool-params.test.ts
git commit -m "feat: add code_search param validation"
```

---

### Task 7: Update storage types for code_search results

**Files:**
- Modify: `storage.ts`

**Step 1: Extend StoredResultData to support context type**

In `storage.ts`, add a new data type and extend `StoredResultData`.

Add after the `QueryResultData` interface:

```typescript
export interface ContextResultData {
  query: string;
  content: string;
  error: string | null;
}
```

Update `StoredResultData`:

```typescript
export interface StoredResultData {
  id: string;
  type: "search" | "fetch" | "context";
  timestamp: number;
  queries?: QueryResultData[];
  urls?: ExtractedContent[];
  context?: ContextResultData;
}
```

Update the `restoreFromSession` validation — add after the existing type checks:

```typescript
if (data.type === "context" && (!data.context || typeof data.context.query !== "string")) continue;
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All PASS (additive change, no breakage)

**Step 3: Commit**

```bash
git add storage.ts
git commit -m "feat: extend storage types for code_search context results"
```

---

### Task 8: Register code_search tool and conditional registration in index.ts

**Files:**
- Modify: `index.ts`

**Step 1: Add imports**

Add to the existing imports at the top of `index.ts`:

```typescript
import { searchContext } from "./exa-context.js";
import { normalizeCodeSearchInput } from "./tool-params.js";
```

Also add `ContextResultData` to the storage import:

```typescript
import {
  generateId,
  storeResult,
  getResult,
  getAllResults,
  clearResults,
  restoreFromSession,
  type StoredResultData,
  type QueryResultData,
  type ExtractedContent,
  type ContextResultData,
} from "./storage.js";
```

**Step 2: Add CodeSearchParams schema**

Add after the existing `GetSearchContentParams`:

```typescript
const CodeSearchParams = Type.Object({
  query: Type.String({ description: "Describe what code you need" }),
  tokensNum: Type.Optional(Type.Number({ description: "Response size in tokens (default: auto, range: 50-100000)" })),
});
```

**Step 3: Wrap all tool registrations in config checks**

Replace each `pi.registerTool({` block with a conditional:

For web_search:
```typescript
const config = getConfig();

if (config.tools.web_search) {
  pi.registerTool({
    name: "web_search",
    // ... existing code unchanged
  });
}
```

For fetch_content:
```typescript
if (config.tools.fetch_content) {
  pi.registerTool({
    name: "fetch_content",
    // ... existing code unchanged
  });
}
```

For get_search_content:
```typescript
if (config.tools.get_search_content) {
  pi.registerTool({
    name: "get_search_content",
    // ... existing code unchanged
  });
}
```

**Important:** Move the `const config = getConfig();` call to the top of the `export default function` body, before any `pi.registerTool` calls. Remove the `getConfig()` call from inside the web_search execute function and use the outer `config` variable (it's already in closure scope). Actually — `getConfig()` is called on each tool execution to pick up config changes via TTL cache. Keep the `getConfig()` call inside `execute` for the API key, but use the top-level `config` read for the registration check only.

Pattern:
```typescript
export default function (pi: ExtensionAPI) {
  const registrationConfig = getConfig();

  // ... event handlers (unchanged) ...

  if (registrationConfig.tools.web_search) {
    pi.registerTool({ /* web_search - unchanged internally */ });
  }

  if (registrationConfig.tools.fetch_content) {
    pi.registerTool({ /* fetch_content - unchanged internally */ });
  }

  if (registrationConfig.tools.code_search) {
    pi.registerTool({ /* code_search - NEW, see Step 4 */ });
  }

  if (registrationConfig.tools.get_search_content) {
    pi.registerTool({ /* get_search_content - unchanged internally */ });
  }
}
```

**Step 4: Register the code_search tool**

Add the `code_search` tool registration (inside the `if (registrationConfig.tools.code_search)` block):

```typescript
pi.registerTool({
  name: "code_search",
  label: "Code Search",
  description:
    "Search GitHub repos, documentation, and Stack Overflow for working code examples. Use for framework usage, API syntax, library patterns, and setup recipes. Returns formatted code snippets, not web pages.",
  parameters: CodeSearchParams,

  async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
    const { query, tokensNum } = normalizeCodeSearchInput(params);

    const config = getConfig();
    const abortController = new AbortController();
    const fetchId = generateId();
    pendingFetches.set(fetchId, abortController);

    const combinedSignal = signal
      ? AbortSignal.any([signal, abortController.signal])
      : abortController.signal;

    try {
      const result = await searchContext(query, {
        apiKey: config.exaApiKey,
        tokensNum,
        signal: combinedSignal,
      });

      const responseId = generateId();
      const contextData: ContextResultData = {
        query: result.query,
        content: result.content,
        error: null,
      };
      const storedData: StoredResultData = {
        id: responseId,
        type: "context",
        timestamp: Date.now(),
        context: contextData,
      };
      storeResult(responseId, storedData);
      pi.appendEntry("web-tools-results", storedData);

      let text = result.content;
      let truncated = false;
      if (text.length > MAX_INLINE_CONTENT) {
        text = text.slice(0, MAX_INLINE_CONTENT);
        text += `\n\n[Content truncated. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
        truncated = true;
      }

      return {
        content: [{ type: "text", text }],
        details: {
          responseId,
          query: result.query,
          charCount: result.content.length,
          truncated,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
        details: { query, error: msg },
      };
    } finally {
      pendingFetches.delete(fetchId);
    }
  },

  renderCall(args, theme) {
    let text = theme.fg("toolTitle", theme.bold("code_search "));
    const queryText = typeof args.query === "string" ? args.query : "";
    const truncated = queryText.length > 60 ? queryText.slice(0, 60) + "…" : queryText;
    text += theme.fg("accent", `"${truncated}"`);
    return new Text(text, 0, 0);
  },

  renderResult(result, { expanded, isPartial }, theme) {
    if (result.isError) {
      const errText = result.content[0];
      const msg = errText?.type === "text" ? errText.text : "Error";
      return new Text(theme.fg("error", msg), 0, 0);
    }

    if (isPartial) {
      return new Text(theme.fg("warning", "Searching code..."), 0, 0);
    }

    const details = result.details as {
      charCount?: number;
      truncated?: boolean;
      query?: string;
    } | undefined;

    let text = theme.fg("success", details?.query ?? "Done");
    if (details?.charCount !== undefined) {
      text += theme.fg("dim", ` (${details.charCount} chars)`);
    }
    if (details?.truncated) {
      text += theme.fg("warning", " [truncated]");
    }

    if (expanded) {
      const content = result.content[0];
      if (content?.type === "text") {
        const preview = content.text.slice(0, 500);
        text += "\n" + theme.fg("dim", preview);
        if (content.text.length > 500) {
          text += theme.fg("muted", "...");
        }
      }
    }

    return new Text(text, 0, 0);
  },
});
```

**Step 5: Update get_search_content to handle context type**

In the `get_search_content` execute function, add a handler for the `context` type. Add this block before the final `throw new Error(...)`:

```typescript
// Handle context results
if (stored.type === "context" && stored.context) {
  const ctx = stored.context;
  if (ctx.error) {
    return {
      content: [{ type: "text", text: `Error: ${ctx.error}` }],
      details: { type: "context", query: ctx.query, error: ctx.error },
    };
  }

  return {
    content: [{ type: "text", text: ctx.content }],
    details: {
      type: "context",
      query: ctx.query,
      charCount: ctx.content.length,
    },
  };
}
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add index.ts
git commit -m "feat: register code_search tool and conditional tool registration"
```

---

## Phase 3: Final Verification

### Task 8: Full test suite and type check

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: fixups from final verification"
```

---

Plan complete and saved to `docs/plans/2026-02-16-exa-expansion.md`. Two execution options:

**1. Subagent-Driven (this session)** — Fresh subagent per task with two-stage review. Better for plans with many independent tasks.

**2. Parallel Session (separate)** — Batch execution with human review checkpoints. Better when tasks are tightly coupled or you want more control between batches.

Which approach?
