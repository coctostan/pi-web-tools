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
