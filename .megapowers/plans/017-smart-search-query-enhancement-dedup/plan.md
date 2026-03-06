# Plan

### Task 1: Pass keyword search type through Exa request body [no-test]

### Task 1: Pass keyword search type through Exa request body [no-test]

**Justification:** Pure TypeScript type-level change with no runtime behavior change. The existing code at `exa-search.ts:97` already passes through any non-`"auto"` type value to the Exa request body. The existing test "sends type parameter when provided" already covers the passthrough mechanism. Only the type union definition needs updating.
**Files:**
- Modify: `exa-search.ts`
**Step 1 — Update the type definition**

In `exa-search.ts`, change the `ExaSearchOptions` interface `type` field from:

```ts
type?: "auto" | "instant" | "deep";
```

to:

```ts
type?: "auto" | "instant" | "deep" | "keyword";
```

The full updated interface:

```ts
export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  type?: "auto" | "instant" | "deep" | "keyword";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
  detail?: "summary" | "highlights";
  maxAgeHours?: number;
}
```

No other code change is required — the existing passthrough logic handles it:

```ts
if (options.type && options.type !== "auto") {
  requestBody.type = options.type;
}
```

**Step 2 — Verify types compile**
Run: `npx tsc --noEmit`
Expected: no errors

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 2: Add rule-based query enhancement helpers

### Task 2: Add rule-based query enhancement helpers

**Files:**
- Create: `smart-search.ts`
- Test: `smart-search.test.ts`

**Step 1 — Write the failing test**
Create `smart-search.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import { enhanceQuery } from "./smart-search.js";

describe("enhanceQuery", () => {
  it("marks error-like queries for keyword search without changing the query text", () => {
    const original = "TypeError: Cannot read properties of undefined (reading 'map')";
    const result = enhanceQuery(original);

    expect(result.originalQuery).toBe(original);
    expect(result.finalQuery).toBe(original);
    expect(result.queryChanged).toBe(false);
    expect(result.typeOverride).toBe("keyword");
    expect(result.appliedRules).toContain("error-like");
  });

  it("preserves an explicit version string when expanding a vague coding query", () => {
    const result = enhanceQuery("react v19.2 hooks");

    expect(result.finalQuery).toBe("react v19.2 hooks docs example");
    expect(result.finalQuery).toContain("v19.2");
  });

  it("does not invent a version string when the query has no explicit version", () => {
    const result = enhanceQuery("vite config");

    expect(result.finalQuery).not.toMatch(/\bv?\d+(?:\.\d+){0,2}\b/);
  });

  it("expands a vague 1-3 word coding query", () => {
    const result = enhanceQuery("vite config");

    expect(result.queryChanged).toBe(true);
    expect(result.finalQuery).toBe("vite config docs example");
    expect(result.appliedRules).toContain("vague-coding-query");
  });

  it("does not expand a query that is already specific", () => {
    const original = "how to configure vite alias in tsconfig";
    const result = enhanceQuery(original);

    expect(result.queryChanged).toBe(false);
    expect(result.finalQuery).toBe(original);
    expect(result.appliedRules).toEqual([]);
  });

  it("does not expand a short query that is not coding related", () => {
    const original = "weather today";
    const result = enhanceQuery(original);

    expect(result.queryChanged).toBe(false);
    expect(result.finalQuery).toBe(original);
    expect(result.appliedRules).toEqual([]);
  });

  it("does not force keyword search for generic title-cased queries that merely mention Error", () => {
    const original = "React Error Boundary docs";
    const result = enhanceQuery(original);

    expect(result.typeOverride).toBeUndefined();
    expect(result.finalQuery).toBe(original);
    expect(result.queryChanged).toBe(false);
    expect(result.appliedRules).toEqual([]);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run smart-search.test.ts`
Expected: FAIL — `Failed to resolve import "./smart-search.js" from "smart-search.test.ts"`

**Step 3 — Write minimal implementation**
Create `smart-search.ts` with this content:

```ts
export interface EnhancedQuery {
  originalQuery: string;
  finalQuery: string;
  queryChanged: boolean;
  typeOverride?: "keyword";
  appliedRules: string[];
}

const CODING_TERMS = new Set([
  "react",
  "vite",
  "vitest",
  "typescript",
  "javascript",
  "node",
  "npm",
  "pnpm",
  "yarn",
  "next",
  "nextjs",
  "tailwind",
  "eslint",
  "jest",
  "webpack",
  "tsconfig",
  "docker",
  "kubernetes",
  "python",
  "django",
  "flask",
  "rust",
  "cargo",
  "go",
  "java",
]);

function words(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

function looksErrorLike(query: string): boolean {
  return /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError)\s*:/i.test(query)
    || /Cannot\s+read\s+properties/i.test(query)
    || /\b[a-zA-Z_$][\w$]*\s+is\s+not\s+(?:defined|a function)\b/i.test(query)
    || /^\s*at\s+\S.+$/m.test(query);
}

function looksCodingQuery(query: string): boolean {
  const tokens = words(query).map((token) => token.toLowerCase());
  return tokens.some((token) => CODING_TERMS.has(token));
}

function isVagueCodingQuery(query: string): boolean {
  const count = words(query).length;
  return count >= 1 && count <= 3 && looksCodingQuery(query);
}

function expandQuery(query: string): string {
  return `${query.trim()} docs example`;
}

export function enhanceQuery(query: string): EnhancedQuery {
  const originalQuery = query;

  if (looksErrorLike(query)) {
    return {
      originalQuery,
      finalQuery: originalQuery,
      queryChanged: false,
      typeOverride: "keyword",
      appliedRules: ["error-like"],
    };
  }

  if (isVagueCodingQuery(query)) {
    const finalQuery = expandQuery(query);
    return {
      originalQuery,
      finalQuery,
      queryChanged: finalQuery !== originalQuery,
      appliedRules: ["vague-coding-query"],
    };
  }

  return {
    originalQuery,
    finalQuery: originalQuery,
    queryChanged: false,
    appliedRules: [],
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run smart-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 3: Add result dedup and snippet cleanup post-processing [depends: 2]

### Task 3: Add result dedup and snippet cleanup post-processing [depends: 2]

**Files:**
- Modify: `smart-search.ts`
- Test: `smart-search.test.ts`

**Step 1 — Write the failing test**
First, at the top of `smart-search.test.ts`, change the import lines from:

```ts
import { describe, expect, it } from "vitest";
import { enhanceQuery } from "./smart-search.js";
```

to:

```ts
import { describe, expect, it } from "vitest";
import type { ExaSearchResult } from "./exa-search.js";
import { enhanceQuery, postProcessResults } from "./smart-search.js";
```

Then, below the closing `});` of the `describe("enhanceQuery", ...)` block, append this test block:

```ts
describe("postProcessResults", () => {
  it("removes later duplicate results while preserving the first ranked result", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Official Docs",
        url: "https://example.com/docs/getting-started?utm_source=google",
        snippet: "Primary result",
      },
      {
        title: "Official Docs Duplicate",
        url: "https://example.com/docs/getting-started?utm_medium=cpc",
        snippet: "Duplicate result",
      },
    ];

    const result = postProcessResults(input);

    expect(result.duplicatesRemoved).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Official Docs");
    expect(result.results[0].url).toContain("utm_source=google");
  });
  it("removes high-confidence breadcrumb and last-updated snippet noise", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Docs",
        url: "https://example.com/docs/api",
        snippet: "Docs > API > fetch_content Last updated Jan 15, 2026. Returns the fetched page.",
      },
    ];

    const result = postProcessResults(input);
    expect(result.results[0].snippet).toBe("Returns the fetched page.");
  });
  it("keeps malformed URLs and normal snippets instead of failing the whole batch", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Broken URL",
        url: "not a valid url",
        snippet: "Normal snippet text.",
      },
      {
        title: "Canonical",
        url: "https://example.com/reference",
        snippet: "Reference docs.",
      },
      {
        title: "Canonical Duplicate",
        url: "https://example.com/reference?utm_campaign=spring",
        snippet: "Reference docs duplicate.",
      },
    ];

    const result = postProcessResults(input);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].url).toBe("not a valid url");
    expect(result.results[0].snippet).toBe("Normal snippet text.");
    expect(result.results[1].title).toBe("Canonical");
    expect(result.duplicatesRemoved).toBe(1);
  });
  it("skips malformed result entries and continues processing later results", () => {
    const input = [
      {
        title: "Broken entry",
        url: 42 as any,
        snippet: undefined as any,
      },
      {
        title: "Canonical",
        url: "https://example.com/reference",
        snippet: "Reference docs.",
      },
      {
        title: "Canonical Duplicate",
        url: "https://example.com/reference?utm_campaign=spring",
        snippet: "Reference docs duplicate.",
      },
    ] as unknown as ExaSearchResult[];

    const result = postProcessResults(input);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      title: "Broken entry",
      url: "",
      snippet: "",
    });
    expect(result.results[1].title).toBe("Canonical");
    expect(result.duplicatesRemoved).toBe(1);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run smart-search.test.ts -t "postProcessResults"`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'replace')`

**Step 3 — Write minimal implementation**
In `smart-search.ts`, append these types and functions below `enhanceQuery`:

```ts
export interface PostProcessedResults<T extends { url: string; snippet: string }> {
  results: T[];
  duplicatesRemoved: number;
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

function normalizeUrlForDedup(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        parsed.searchParams.delete(key);
      }
    }

    const pathname = parsed.pathname !== "/" && parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;

    const search = parsed.searchParams.toString();
    return `${parsed.origin}${pathname}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

function cleanSnippet(snippet: string): string {
  let cleaned = snippet;

  cleaned = cleaned.replace(/^\s*(?:[^>\n]+\s>\s){2,}[^.]*\.?\s*/i, "");
  cleaned = cleaned.replace(/\bLast updated\s+[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\.?\s*/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || snippet;
}

export function postProcessResults<T extends { url: string; snippet: string }>(results: T[]): PostProcessedResults<T> {
  const seen = new Set<string>();
  const kept: T[] = [];
  let duplicatesRemoved = 0;

  for (const result of results) {
    const safeUrl = typeof (result as any).url === "string" ? (result as any).url : "";
    const safeSnippet = typeof (result as any).snippet === "string" ? (result as any).snippet : "";
    const cleaned = {
      ...result,
      url: safeUrl,
      snippet: cleanSnippet(safeSnippet),
    } as T;

    const normalized = safeUrl ? normalizeUrlForDedup(safeUrl) : null;
    if (normalized === null) {
      kept.push(cleaned);
      continue;
    }
    if (seen.has(normalized)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(normalized);
    kept.push(cleaned);
  }

  return { results: kept, duplicatesRemoved };
}
```

No test file changes needed in this step — the imports were already updated in Step 1.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run smart-search.test.ts -t "postProcessResults"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 4: Integrate smart search into web_search output and fail-open flow [depends: 1, 2, 3]

### Task 4: Integrate smart search into web_search output and fail-open flow [depends: 1, 2, 3]

**Files:**
- Modify: `index.ts`
- Create: `smart-search.integration.test.ts`

**Step 1 — Write the failing test**
Create `smart-search.integration.test.ts` with this content:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const pLimitState = vi.hoisted(() => ({
  pLimitSpy: vi.fn((_concurrency: number) => {
    return <T>(fn: () => Promise<T>) => fn();
  }),
}));

vi.mock("p-limit", () => ({
  default: pLimitState.pLimitSpy,
}));

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
      web_search: true,
      fetch_content: false,
      code_search: false,
      get_search_content: false,
    },
  },
}));

vi.mock("./config.js", () => ({
  getConfig: () => configState.value,
  resetConfigCache: vi.fn(),
}));

const exaState = vi.hoisted(() => ({
  searchExa: vi.fn(),
  findSimilarExa: vi.fn(),
  formatSearchResults: vi.fn(),
}));

vi.mock("./exa-search.js", () => ({
  searchExa: exaState.searchExa,
  findSimilarExa: exaState.findSimilarExa,
  formatSearchResults: exaState.formatSearchResults,
}));

const smartSearchState = vi.hoisted(() => ({
  enhanceQuery: vi.fn(),
  postProcessResults: vi.fn(),
}));

vi.mock("./smart-search.js", () => ({
  enhanceQuery: smartSearchState.enhanceQuery,
  postProcessResults: smartSearchState.postProcessResults,
}));

vi.mock("./extract.js", () => ({
  extractContent: vi.fn(),
  fetchAllContent: vi.fn(),
  clearUrlCache: vi.fn(),
}));

vi.mock("./github-extract.js", () => ({
  extractGitHub: vi.fn(),
  clearCloneCache: vi.fn(),
  parseGitHubUrl: vi.fn(),
}));

vi.mock("./exa-context.js", () => ({
  searchContext: vi.fn(),
}));

vi.mock("./filter.js", () => ({
  filterContent: vi.fn(),
}));

vi.mock("./offload.js", () => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: vi.fn(),
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
  FILE_FIRST_PREVIEW_SIZE: 500,
}));

vi.mock("./storage.js", () => ({
  generateId: vi.fn(() => "response-1"),
  storeResult: vi.fn(),
  getResult: vi.fn(),
  getAllResults: vi.fn(() => []),
  clearResults: vi.fn(),
  restoreFromSession: vi.fn(),
}));

async function getWebSearchTool() {
  vi.resetModules();
  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => tools.set(def.name, def)),
    appendEntry: vi.fn(),
  };

  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);

  const webSearchTool = tools.get("web_search");
  if (!webSearchTool) throw new Error("web_search tool was not registered");
  return webSearchTool;
}

function getText(result: any): string {
  const first = result?.content?.[0];
  return first?.type === "text" ? first.text : "";
}

describe("web_search smart-search integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smartSearchState.postProcessResults.mockImplementation((results: any[]) => ({
      results,
      duplicatesRemoved: 0,
    }));
    exaState.searchExa.mockResolvedValue([
      { title: "Result", url: "https://example.com", snippet: "summary" },
    ]);
    exaState.formatSearchResults.mockReturnValue(
      "1. **Result**\n   https://example.com\n   summary"
    );
  });

  it("keeps the schema unchanged and shows keyword + searched-as notes only when smart search changes behavior", async () => {
    smartSearchState.enhanceQuery.mockReturnValueOnce({
      originalQuery: "TypeError: Cannot read properties of undefined",
      finalQuery: "TypeError: Cannot read properties of undefined",
      queryChanged: false,
      typeOverride: "keyword",
      appliedRules: ["error-like"],
    });

    smartSearchState.enhanceQuery.mockReturnValueOnce({
      originalQuery: "vite config",
      finalQuery: "vite config docs example",
      queryChanged: true,
      appliedRules: ["vague-coding-query"],
    });

    smartSearchState.enhanceQuery.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    smartSearchState.enhanceQuery.mockReturnValueOnce({
      originalQuery: "react query cache invalidation",
      finalQuery: "react query cache invalidation",
      queryChanged: false,
      appliedRules: [],
    });

    const webSearchTool = await getWebSearchTool();

    expect(webSearchTool.parameters.properties.smartSearch).toBeUndefined();

    const keywordResult = await webSearchTool.execute("call-1", {
      query: "TypeError: Cannot read properties of undefined",
    });
    expect(exaState.searchExa).toHaveBeenNthCalledWith(
      1,
      "TypeError: Cannot read properties of undefined",
      expect.objectContaining({ type: "keyword" })
    );
    expect(getText(keywordResult)).toContain("Keyword search used.");
    expect(getText(keywordResult)).not.toContain("Searched as:");

    const expandedResult = await webSearchTool.execute("call-2", {
      query: "vite config",
    });
    expect(exaState.searchExa).toHaveBeenNthCalledWith(
      2,
      "vite config docs example",
      expect.objectContaining({ type: undefined })
    );
    expect(getText(expandedResult)).toContain("Searched as: vite config docs example");

    const failOpenResult = await webSearchTool.execute("call-3", {
      query: "react router loader",
    });
    expect(exaState.searchExa).toHaveBeenNthCalledWith(
      3,
      "react router loader",
      expect.objectContaining({ type: undefined })
    );
    expect(getText(failOpenResult)).toContain("## Query: react router loader");

    smartSearchState.postProcessResults.mockReturnValueOnce({
      results: [{ title: "Result", url: "https://example.com", snippet: "summary" }],
      duplicatesRemoved: 1,
    });
    const unchangedResult = await webSearchTool.execute("call-4", {
      query: "react query cache invalidation",
    });
    expect(exaState.searchExa).toHaveBeenNthCalledWith(
      4,
      "react query cache invalidation",
      expect.objectContaining({ type: undefined })
    );
    expect(getText(unchangedResult)).not.toContain("Searched as:");
    expect(getText(unchangedResult)).not.toContain("Keyword search used.");
    expect(getText(unchangedResult)).not.toContain("Removed 1 duplicate results.");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run smart-search.integration.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to have been called with arguments: [ 'TypeError: Cannot read properties of undefined', ObjectContaining{ type: 'keyword' } ]`

**Step 3 — Write minimal implementation**
In `index.ts`, add this import near the top:

```ts
import { enhanceQuery, postProcessResults } from "./smart-search.js";
```

Then, inside the normal `web_search` query loop, replace the existing `searchExa`/`formatSearchResults` block with this implementation:

```ts
const resultPromises = queryList.map((q) =>
  limit(async (): Promise<QueryResultData> => {
    let enhanced = {
      originalQuery: q,
      finalQuery: q,
      queryChanged: false,
      appliedRules: [] as string[],
      typeOverride: undefined as "keyword" | undefined,
    };

    try {
      enhanced = enhanceQuery(q);
    } catch {
      enhanced = {
        originalQuery: q,
        finalQuery: q,
        queryChanged: false,
        appliedRules: [],
        typeOverride: undefined,
      };
    }

    try {
      const searchResults = await searchExa(enhanced.finalQuery, {
        apiKey: config.exaApiKey,
        numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
        type: enhanced.typeOverride ?? type,
        category,
        includeDomains,
        excludeDomains,
        signal: combinedSignal,
        detail,
        maxAgeHours,
      });

      let processedResults = searchResults;
      let duplicatesRemoved = 0;

      try {
        const processed = postProcessResults(searchResults);
        processedResults = processed.results;
        duplicatesRemoved = processed.duplicatesRemoved;
      } catch {
        processedResults = searchResults;
        duplicatesRemoved = 0;
      }

      const formatted = formatSearchResults(processedResults);
      const notes: string[] = [];

      if (enhanced.typeOverride === "keyword") {
        notes.push("Keyword search used.");
      }
      if (enhanced.queryChanged) {
        notes.push(`Searched as: ${enhanced.finalQuery}`);
      }

      const answer = notes.length > 0
        ? `${notes.join("\n")}\n\n${formatted}`
        : formatted;

      successfulQueries++;
      totalResults += processedResults.length;

      return {
        query: q,
        answer,
        results: processedResults.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        query: q,
        answer: "",
        results: [],
        error: msg,
      };
    }
  })
);
```

Do not change `WebSearchParams`; the schema must remain exactly as it is today.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run smart-search.integration.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
