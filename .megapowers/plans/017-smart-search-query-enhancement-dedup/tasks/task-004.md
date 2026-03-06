---
id: 4
title: Integrate smart search into web_search output and fail-open flow
status: approved
depends_on:
  - 1
  - 2
  - 3
no_test: false
files_to_modify:
  - index.ts
files_to_create:
  - smart-search.integration.test.ts
---

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
