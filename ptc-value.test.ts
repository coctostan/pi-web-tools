import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const state = vi.hoisted(() => ({
  extractContent: vi.fn(),
  filterContent: vi.fn(),
  clearUrlCache: vi.fn(),
}));

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
    exaApiKey: "test-key",
    filterModel: undefined,
    github: {
      maxRepoSizeMB: 350,
      cloneTimeoutSeconds: 30,
      clonePath: "/tmp/pi-github-repos",
    },
    tools: {
      web_search: true,
      fetch_content: true,
      code_search: true,
      get_search_content: true,
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

const contextState = vi.hoisted(() => ({
  searchContext: vi.fn(),
}));
vi.mock("./exa-context.js", () => ({
  searchContext: contextState.searchContext,
}));

const ghState = vi.hoisted(() => ({
  parseGitHubUrl: vi.fn(),
  extractGitHub: vi.fn(),
  clearCloneCache: vi.fn(),
}));
vi.mock("./github-extract.js", () => ({
  parseGitHubUrl: ghState.parseGitHubUrl,
  extractGitHub: ghState.extractGitHub,
  clearCloneCache: ghState.clearCloneCache,
}));

vi.mock("./extract.js", () => ({
  extractContent: state.extractContent,
  fetchAllContent: vi.fn(),
  clearUrlCache: state.clearUrlCache,
}));

vi.mock("./filter.js", () => ({
  filterContent: state.filterContent,
}));

const offloadState = vi.hoisted(() => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: vi.fn(() => "/tmp/pi-web-test.txt"),
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));
vi.mock("./offload.js", () => ({
  shouldOffload: offloadState.shouldOffload,
  offloadToFile: offloadState.offloadToFile,
  buildOffloadResult: offloadState.buildOffloadResult,
  cleanupTempFiles: offloadState.cleanupTempFiles,
  FILE_FIRST_PREVIEW_SIZE: 500,
}));

// --- Helpers ---

async function getAllTools() {
  vi.resetModules();
  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => tools.set(def.name, def)),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  return tools;
}

const ctx = {
  modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
} as any;

// --- Tests ---


describe("web_search ptcValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes ptcValue with structured query results on success", async () => {
    exaState.searchExa.mockResolvedValueOnce([
      { title: "Result 1", url: "https://example.com/1", snippet: "snippet 1" },
      { title: "Result 2", url: "https://example.com/2", snippet: "snippet 2" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted");

    const tools = await getAllTools();
    const tool = tools.get("web_search")!;
    const result = await tool.execute("call-1", { query: "test query" });

    const ptc = result.details.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.responseId).toBe(result.details.responseId);
    expect(ptc.queryCount).toBe(1);
    expect(ptc.successfulQueries).toBe(1);
    expect(ptc.totalResults).toBe(2);
    expect(ptc.queries).toHaveLength(1);
    expect(ptc.queries[0].query).toBe("test query");
    expect(ptc.queries[0].error).toBeNull();
    expect(ptc.queries[0].results).toEqual([
      { title: "Result 1", url: "https://example.com/1", snippet: "snippet 1" },
      { title: "Result 2", url: "https://example.com/2", snippet: "snippet 2" },
    ]);
  });

  it("includes error info in ptcValue when query fails", async () => {
    exaState.searchExa.mockRejectedValueOnce(new Error("API down"));
    exaState.formatSearchResults.mockReturnValue("formatted");

    const tools = await getAllTools();
    const tool = tools.get("web_search")!;
    const result = await tool.execute("call-err", { query: "fail query" });

    const ptc = result.details.ptcValue;
    expect(ptc.queries[0].error).toBe("API down");
    expect(ptc.queries[0].results).toEqual([]);
  });

  it("ptcValue is JSON-serializable", async () => {
    exaState.searchExa.mockResolvedValueOnce([
      { title: "R", url: "https://example.com", snippet: "s" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted");

    const tools = await getAllTools();
    const tool = tools.get("web_search")!;
    const result = await tool.execute("call-json", { query: "test" });

    const ptc = result.details.ptcValue;
    expect(() => JSON.parse(JSON.stringify(ptc))).not.toThrow();
    expect(JSON.parse(JSON.stringify(ptc))).toEqual(ptc);
  });
});

describe("code_search ptcValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes ptcValue on success", async () => {
    contextState.searchContext.mockResolvedValueOnce({
      query: "react hooks",
      content: "const [state, setState] = useState(0);",
    });

    const tools = await getAllTools();
    const tool = tools.get("code_search")!;
    const result = await tool.execute("call-code", { query: "react hooks" });

    const ptc = result.details.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.responseId).toBe(result.details.responseId);
    expect(ptc.query).toBe("react hooks");
    expect(ptc.content).toBe("const [state, setState] = useState(0);");
    expect(ptc.charCount).toBe(38);
    expect(ptc.truncated).toBe(false);
  });

  it("includes ptcValue on error", async () => {
    contextState.searchContext.mockRejectedValueOnce(new Error("timeout"));

    const tools = await getAllTools();
    const tool = tools.get("code_search")!;
    const result = await tool.execute("call-code-err", { query: "fail" });

    const ptc = result.details.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.query).toBe("fail");
    expect(ptc.error).toBe("timeout");
  });
});

describe("fetch_content ptcValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ghState.parseGitHubUrl.mockReturnValue(null);
  });

  it("includes ptcValue on single URL error", async () => {
    state.extractContent.mockResolvedValueOnce({
      url: "https://example.com",
      title: null,
      content: "",
      error: "404 Not Found",
    });

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute("call-err", { url: "https://example.com" }, undefined, undefined, ctx);

    const ptc = result.details.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.responseId).toBe(result.details.responseId);
    expect(ptc.urls).toHaveLength(1);
    expect(ptc.urls[0].url).toBe("https://example.com");
    expect(ptc.urls[0].error).toBe("404 Not Found");
    expect(ptc.successCount).toBe(0);
    expect(ptc.totalCount).toBe(1);
  });

  it("includes ptcValue on single URL filtered success", async () => {
    state.extractContent.mockResolvedValueOnce({
      url: "https://example.com/docs",
      title: "Docs",
      content: "RAW PAGE",
      error: null,
    });
    state.filterContent.mockResolvedValueOnce({
      filtered: "100 req/min",
      model: "anthropic/claude-haiku-4-5",
    });

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-filtered",
      { url: "https://example.com/docs", prompt: "rate limit?" },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    expect(ptc.urls).toHaveLength(1);
    expect(ptc.urls[0].filtered).toBe("100 req/min");
    expect(ptc.urls[0].error).toBeNull();
    expect(ptc.successCount).toBe(1);
  });

  it("includes ptcValue on single URL raw offloaded", async () => {
    state.extractContent.mockResolvedValueOnce({
      url: "https://example.com/page",
      title: "Page",
      content: "X".repeat(2000),
      error: null,
    });
    offloadState.offloadToFile.mockReturnValueOnce("/tmp/pi-web-test.txt");

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-raw",
      { url: "https://example.com/page" },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    expect(ptc.urls[0].filePath).toBe("/tmp/pi-web-test.txt");
    expect(ptc.urls[0].charCount).toBe(2000);
    expect(ptc.urls[0].error).toBeNull();
  });

  it("includes ptcValue on GitHub clone result", async () => {
    ghState.parseGitHubUrl.mockReturnValueOnce({ owner: "test", repo: "repo", type: "root", refIsFullSha: false });
    ghState.extractGitHub.mockResolvedValueOnce({
      url: "https://github.com/test/repo",
      title: "test/repo",
      content: "├── src/",
      error: null,
    });

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-gh",
      { url: "https://github.com/test/repo" },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    expect(ptc.urls[0].content).toBe("├── src/");
    expect(ptc.urls[0].title).toBe("test/repo");
  });

  it("includes ptcValue on multi-URL with prompt", async () => {
    state.extractContent.mockImplementation(async (url: string) => ({
      url,
      title: `Title ${url}`,
      content: `Content ${url}`,
      error: null,
    }));
    state.filterContent.mockResolvedValue({
      filtered: "filtered answer",
      model: "anthropic/claude-haiku-4-5",
    });

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-multi-prompt",
      { urls: ["https://a.com", "https://b.com"], prompt: "question" },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    expect(ptc.urls).toHaveLength(2);
    expect(ptc.urls[0].filtered).toBe("filtered answer");
    expect(ptc.urls[1].filtered).toBe("filtered answer");
    expect(ptc.successCount).toBe(2);
    expect(ptc.totalCount).toBe(2);
  });

  it("includes ptcValue on multi-URL without prompt", async () => {
    state.extractContent.mockImplementation(async (url: string) => ({
      url,
      title: `Title ${url}`,
      content: `Content ${url}`,
      error: null,
    }));
    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-multi.txt");

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-multi-raw",
      { urls: ["https://a.com", "https://b.com"] },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    expect(ptc.urls).toHaveLength(2);
    expect(ptc.urls[0].filePath).toBe("/tmp/pi-web-multi.txt");
    expect(ptc.successCount).toBe(2);
  });
});

describe("get_search_content ptcValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ghState.parseGitHubUrl.mockReturnValue(null);
  });

  it("includes ptcValue for search results (single query)", async () => {
    // First do a web_search to store results
    exaState.searchExa.mockResolvedValueOnce([
      { title: "R1", url: "https://r1.com", snippet: "s1" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted");

    const tools = await getAllTools();
    const searchTool = tools.get("web_search")!;
    const searchResult = await searchTool.execute("call-s", { query: "test" });
    const responseId = searchResult.details.responseId;

    const getTool = tools.get("get_search_content")!;
    const result = await getTool.execute("call-g", { responseId, query: "test" });

    const ptc = result.details.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.type).toBe("search");
    expect(ptc.query).toBe("test");
    expect(ptc.results).toEqual([{ title: "R1", url: "https://r1.com", snippet: "s1" }]);
  });

  it("includes ptcValue for fetch results (single URL)", async () => {
    state.extractContent.mockResolvedValueOnce({
      url: "https://example.com",
      title: "Example",
      content: "Hello world",
      error: null,
    });
    offloadState.offloadToFile.mockReturnValueOnce("/tmp/test.txt");

    const tools = await getAllTools();
    const fetchTool = tools.get("fetch_content")!;
    const fetchResult = await fetchTool.execute(
      "call-f", { url: "https://example.com" }, undefined, undefined, ctx
    );
    const responseId = fetchResult.details.responseId;

    const getTool = tools.get("get_search_content")!;
    const result = await getTool.execute("call-g2", { responseId, url: "https://example.com" });

    const ptc = result.details.ptcValue;
    expect(ptc.type).toBe("fetch");
    expect(ptc.url).toBe("https://example.com");
    expect(ptc.content).toBe("Hello world");
    expect(ptc.charCount).toBe(11);
  });

  it("includes ptcValue for context results", async () => {
    contextState.searchContext.mockResolvedValueOnce({
      query: "react hooks",
      content: "useState example",
    });

    const tools = await getAllTools();
    const codeTool = tools.get("code_search")!;
    const codeResult = await codeTool.execute("call-c", { query: "react hooks" });
    const responseId = codeResult.details.responseId;

    const getTool = tools.get("get_search_content")!;
    const result = await getTool.execute("call-g3", { responseId });

    const ptc = result.details.ptcValue;
    expect(ptc.type).toBe("context");
    expect(ptc.query).toBe("react hooks");
    expect(ptc.content).toBe("useState example");
    expect(ptc.charCount).toBe(16);
  });
});
