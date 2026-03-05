import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  extractContent: vi.fn(),
  filterContent: vi.fn(),
}));

const pLimitState = vi.hoisted(() => ({
  pLimitSpy: vi.fn((concurrency: number) => {
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
      web_search: false,
      fetch_content: true,
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
  formatSearchResults: vi.fn(),
}));

const offloadState = vi.hoisted(() => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: vi.fn(),
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));

vi.mock("./exa-search.js", () => ({
  searchExa: exaState.searchExa,
  formatSearchResults: exaState.formatSearchResults,
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
}));

vi.mock("./filter.js", () => ({
  filterContent: state.filterContent,
}));

vi.mock("./offload.js", () => ({
  shouldOffload: offloadState.shouldOffload,
  offloadToFile: offloadState.offloadToFile,
  buildOffloadResult: offloadState.buildOffloadResult,
  cleanupTempFiles: offloadState.cleanupTempFiles,
  FILE_FIRST_PREVIEW_SIZE: 500,
}));

async function getFetchContentTool() {
  vi.resetModules();
  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => {
      tools.set(def.name, def);
    }),
    appendEntry: vi.fn(),
  };

  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);

  const fetchContentTool = tools.get("fetch_content");
  if (!fetchContentTool) {
    throw new Error("fetch_content tool was not registered");
  }

  return { fetchContentTool };
}

async function getWebSearchTool() {
  vi.resetModules();

  const previousTools = { ...configState.value.tools };
  configState.value.tools = {
    web_search: true,
    fetch_content: false,
    code_search: false,
    get_search_content: false,
  };

  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => tools.set(def.name, def)),
    appendEntry: vi.fn(),
  };

  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);

  configState.value.tools = previousTools;

  const webSearchTool = tools.get("web_search");
  if (!webSearchTool) {
    throw new Error("web_search tool was not registered");
  }

  return { webSearchTool };
}

async function getFetchAndGetSearchContentTools() {
  vi.resetModules();
  const previousTools = { ...configState.value.tools };
  configState.value.tools = {
    web_search: false,
    fetch_content: true,
    code_search: false,
    get_search_content: true,
  };
  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => {
      tools.set(def.name, def);
    }),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  configState.value.tools = previousTools;
  const fetchContentTool = tools.get("fetch_content");
  const getSearchContentTool = tools.get("get_search_content");
  if (!fetchContentTool) throw new Error("fetch_content tool was not registered");
  if (!getSearchContentTool) throw new Error("get_search_content tool was not registered");
  return { fetchContentTool, getSearchContentTool };
}

async function getToolResultHandler() {
  vi.resetModules();

  const handlers = new Map<string, any>();
  const pi = {
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
  };

  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);

  const handler = handlers.get("tool_result");
  if (!handler) throw new Error("tool_result handler not registered");
  return handler;
}

function getText(result: any): string {
  const first = result?.content?.[0];
  return first?.type === "text" ? first.text : "";
}

describe("web_search detail passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("web_search schema exposes detail enum summary|highlights", async () => {
    const { webSearchTool } = await getWebSearchTool();

    const detailSchema = webSearchTool.parameters.properties.detail;
    expect(detailSchema).toBeDefined();
    expect(detailSchema.anyOf.map((v: any) => v.const)).toEqual(["summary", "highlights"]);
  });

  it("web_search execute passes normalized detail to searchExa", async () => {
    exaState.searchExa.mockResolvedValueOnce([
      { title: "Result", url: "https://example.com", snippet: "summary" },
    ]);
    exaState.formatSearchResults.mockReturnValue(
      "1. **Result**\n   https://example.com\n   summary"
    );

    const { webSearchTool } = await getWebSearchTool();

    await webSearchTool.execute("call-web", { query: "x", detail: "highlights" });

    expect(exaState.searchExa).toHaveBeenCalledWith(
      "x",
      expect.objectContaining({ detail: "highlights" })
    );
  });
});
describe("fetch_content single-url prompt wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.extractContent.mockResolvedValue({
      url: "https://example.com/docs",
      title: "Docs",
      content: "RAW PAGE",
      error: null,
    });

    state.filterContent
      .mockResolvedValueOnce({
        filtered: "100 requests/minute.",
        model: "anthropic/claude-haiku-4-5",
      })
      .mockResolvedValueOnce({
        filtered: null,
        reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)",
      })
      .mockResolvedValueOnce({
        filtered: null,
        reason: "Filter model error: Rate limit exceeded",
      });
  });

  it("uses filterContent in prompt mode, remaps no-model warning, preserves model-error warning, and keeps no-prompt raw behavior", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: {
        find: vi.fn(),
        getApiKey: vi.fn(),
      },
    } as any;

    const filteredResult = await fetchContentTool.execute(
      "call-1",
      { url: "https://example.com/docs", prompt: "What is the rate limit?" },
      undefined,
      undefined,
      ctx
    );

    expect(state.filterContent).toHaveBeenCalledWith(
      "RAW PAGE",
      "What is the rate limit?",
      ctx.modelRegistry,
      undefined,
      expect.any(Function)
    );

    expect(getText(filteredResult)).toBe("Source: https://example.com/docs\n\n100 requests/minute.");
    expect(offloadState.offloadToFile).not.toHaveBeenCalled();

    const noModelFallback = await fetchContentTool.execute(
      "call-2",
      { url: "https://example.com/docs", prompt: "What is the rate limit?" },
      undefined,
      undefined,
      ctx
    );

    expect(getText(noModelFallback)).toContain("No filter model available");
    expect(getText(noModelFallback)).toContain("Full content saved to");
    expect(offloadState.offloadToFile).toHaveBeenCalled();

    const modelErrorFallback = await fetchContentTool.execute(
      "call-3",
      { url: "https://example.com/docs", prompt: "What is the rate limit?" },
      undefined,
      undefined,
      ctx
    );

    expect(getText(modelErrorFallback)).toContain("⚠ Filter model error: Rate limit exceeded");

    const callsBeforeNoPrompt = state.filterContent.mock.calls.length;

    const rawResult = await fetchContentTool.execute(
      "call-4",
      { url: "https://example.com/docs" },
      undefined,
      undefined,
      ctx
    );

    expect(state.filterContent).toHaveBeenCalledTimes(callsBeforeNoPrompt);
    expect(getText(rawResult)).toContain("Docs");
    expect(getText(rawResult)).toContain("Full content saved to");
    expect(offloadState.offloadToFile).toHaveBeenCalled();
  });

  it("uses p-limit(3) and returns filtered + fallback blocks for multi-url prompt mode", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.example/docs") {
        return { url, title: "A Docs", content: "RAW A", error: null };
      }
      if (url === "https://b.example/docs") {
        return { url, title: "B Docs", content: "RAW B", error: null };
      }
      return { url, title: "C Docs", content: "RAW C", error: null };
    });

    state.filterContent.mockReset();

    state.filterContent
      .mockResolvedValueOnce({
        filtered: "A: 100 requests/minute.",
        model: "anthropic/claude-haiku-4-5",
      })
      .mockResolvedValueOnce({
        filtered: null,
        reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)",
      })
      .mockResolvedValueOnce({
        filtered: "C: 60 requests/minute.",
        model: "anthropic/claude-haiku-4-5",
      });

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: {
        find: vi.fn(),
        getApiKey: vi.fn(),
      },
    } as any;

    const result = await fetchContentTool.execute(
      "call-multi",
      {
        urls: [
          "https://a.example/docs",
          "https://b.example/docs",
          "https://c.example/docs",
        ],
        prompt: "What are the rate limits?",
      },
      undefined,
      undefined,
      ctx
    );

    const text = getText(result);
    expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
    expect(state.filterContent).toHaveBeenCalledTimes(3);
    expect(state.filterContent).toHaveBeenNthCalledWith(
      1,
      "RAW A",
      "What are the rate limits?",
      ctx.modelRegistry,
      undefined,
      expect.any(Function)
    );
    expect(text).toContain("Source: https://a.example/docs\n\nA: 100 requests/minute.");
    expect(text).toContain("Source: https://c.example/docs\n\nC: 60 requests/minute.");
    expect(text).toContain("# B Docs");
    expect(text).toContain("Full content saved to");
    expect(offloadState.offloadToFile).toHaveBeenCalled();
  });

  it("keeps existing multi-url summary behavior when prompt is omitted and does not call filterContent", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.example/docs") {
        return { url, title: "A Docs", content: "RAW A", error: null };
      }
      if (url === "https://b.example/docs") {
        return { url, title: "B Docs", content: "RAW B", error: null };
      }
      return { url, title: "C Docs", content: "RAW C", error: "timeout" };
    });

    state.filterContent.mockReset();

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: {
        find: vi.fn(),
        getApiKey: vi.fn(),
      },
    } as any;

    const result = await fetchContentTool.execute(
      "call-no-prompt",
      {
        urls: [
          "https://a.example/docs",
          "https://b.example/docs",
          "https://c.example/docs",
        ],
      },
      undefined,
      undefined,
      ctx
    );

    const text = getText(result);

    expect(text).toContain("Fetched 2/3 URLs.");
    expect(text).toContain("A Docs");
    expect(text).toContain("B Docs");
    expect(text).toContain("❌ https://c.example/docs: timeout");
    expect(offloadState.offloadToFile).toHaveBeenCalledTimes(2);
    expect(state.filterContent).not.toHaveBeenCalled();
  });
});


describe("fetch_content file-first storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.extractContent.mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "A".repeat(2000),
      error: null,
    });
    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-abc123.txt");
  });

  it("writes raw single-URL fetch to temp file and returns 500-char preview + path", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-file-first",
      { url: "https://example.com/page" },
      undefined,
      undefined,
      ctx
    );

    expect(offloadState.offloadToFile).toHaveBeenCalledOnce();
    const writtenContent = offloadState.offloadToFile.mock.calls[0][0];
    expect(writtenContent).toContain("Example Page");
    expect(writtenContent).toContain("A".repeat(2000));

    const text = getText(result);
    expect(text.length).toBeLessThan(2000);
    expect(text).toContain("/tmp/pi-web-abc123.txt");
    expect(text).toContain("Example Page");
    expect(text).toContain("https://example.com/page");
    expect(text).not.toContain("A".repeat(2000));
  });

  it("writes single-url prompt fallback content to temp file (no MAX_INLINE path)", async () => {
    state.extractContent.mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "X".repeat(2000),
      error: null,
    });

    state.filterContent.mockReset();
    state.filterContent.mockResolvedValueOnce({
      filtered: null,
      reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)",
    });

    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-single-fallback.txt");

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

    const result = await fetchContentTool.execute(
      "call-single-fallback",
      { url: "https://example.com/page", prompt: "What matters?" },
      undefined,
      undefined,
      ctx
    );

    expect(offloadState.offloadToFile).toHaveBeenCalledTimes(1);
    const text = getText(result);
    expect(text).toContain("Source: https://example.com/page");
    expect(text).toContain("/tmp/pi-web-single-fallback.txt");
    expect(text).toContain("Full content saved to");
    expect(text).not.toContain("Content truncated");
    expect(text).not.toContain("MAX_INLINE_CONTENT");
  });

  it("writes each multi-URL raw fetch to its own temp file", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.example/page") {
        return { url, title: "Page A", content: "Content A " + "x".repeat(1000), error: null };
      }
      return { url, title: "Page B", content: "Content B " + "y".repeat(1000), error: null };
    });

    let callCount = 0;
    offloadState.offloadToFile.mockImplementation(() => {
      callCount++;
      return `/tmp/pi-web-file${callCount}.txt`;
    });

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-multi-file",
      { urls: ["https://a.example/page", "https://b.example/page"] },
      undefined,
      undefined,
      ctx
    );

    expect(offloadState.offloadToFile).toHaveBeenCalledTimes(2);

    const text = getText(result);
    expect(text).toContain("Page A");
    expect(text).toContain("Page B");
    expect(text).toContain("/tmp/pi-web-file1.txt");
    expect(text).toContain("/tmp/pi-web-file2.txt");
    expect(text).toContain("https://a.example/page");
    expect(text).toContain("https://b.example/page");
  });

  it("keeps single-url GitHub clone result inline (no file-first)", async () => {
    ghState.parseGitHubUrl.mockReturnValue({ owner: "test", repo: "repo", type: "root", refIsFullSha: false });
    ghState.extractGitHub.mockResolvedValue({
      url: "https://github.com/test/repo",
      title: "test/repo",
      content: "├── src/\n└── package.json",
      error: null,
    });

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
    const result = await fetchContentTool.execute(
      "call-gh-single",
      { url: "https://github.com/test/repo" },
      undefined,
      undefined,
      ctx
    );

    expect(offloadState.offloadToFile).not.toHaveBeenCalled();
    const text = getText(result);
    expect(text).toContain("├── src/");
    expect(text).not.toContain("Full content saved to");
  });

  it("only successful GitHub clone URLs stay inline in mixed multi-url raw fetches", async () => {
    ghState.parseGitHubUrl.mockImplementation((url: string) =>
      url.startsWith("https://github.com/test/repo")
        ? { owner: "test", repo: "repo", type: "root", refIsFullSha: false }
        : null
    );

    ghState.extractGitHub
      .mockResolvedValueOnce({
        url: "https://github.com/test/repo",
        title: "test/repo",
        content: "├── src/\n└── package.json",
        error: null,
      })
      .mockResolvedValueOnce(null);

    state.extractContent.mockResolvedValue({
      url: "https://github.com/test/repo/blob/main/README.md",
      title: "README",
      content: "R".repeat(1500),
      error: null,
    });

    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-fallback-gh.txt");

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
    const result = await fetchContentTool.execute(
      "call-gh-mixed",
      { urls: ["https://github.com/test/repo", "https://github.com/test/repo/blob/main/README.md"] },
      undefined,
      undefined,
      ctx
    );

    expect(offloadState.offloadToFile).toHaveBeenCalledTimes(1);
    const text = getText(result);
    expect(text).toContain("test/repo");
    expect(text).toContain("├── src/");
    expect(text).toContain("/tmp/pi-web-fallback-gh.txt");
  });

  it("get_search_content still returns full content from in-memory store after file-first fetch", async () => {
    state.extractContent.mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "A".repeat(2000),
      error: null,
    });
    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-full.txt");

    const { fetchContentTool, getSearchContentTool } = await getFetchAndGetSearchContentTools();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

    const fetchResult = await fetchContentTool.execute(
      "call-fetch",
      { url: "https://example.com/page" },
      undefined,
      undefined,
      ctx
    );

    const fetchText = getText(fetchResult);
    expect(fetchText).toContain("Full content saved to");

    const responseId = fetchResult.details.responseId;
    const fullResult = await getSearchContentTool.execute(
      "call-get",
      { responseId, url: "https://example.com/page" },
      undefined,
      undefined,
      ctx
    );

    const fullText = getText(fullResult);
    expect(fullText).toContain("# Example Page");
    expect(fullText).toContain("A".repeat(2000));
  });

  it("returns warning + inline preview for failed file writes in multi-url raw mode", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.example/page") {
        return { url, title: "Page A", content: "A".repeat(1200), error: null };
      }
      return { url, title: "Page B", content: "B".repeat(1200), error: null };
    });

    offloadState.offloadToFile.mockImplementation((text: string) => {
      if (text.includes("# Page B")) {
        throw new Error("ENOSPC");
      }
      return "/tmp/pi-web-page-a.txt";
    });

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
    const result = await fetchContentTool.execute(
      "call-multi-write-fail",
      { urls: ["https://a.example/page", "https://b.example/page"] },
      undefined,
      undefined,
      ctx
    );

    const text = getText(result);
    expect(text).toContain("/tmp/pi-web-page-a.txt");
    expect(text).toContain("⚠ Could not write temp file. Returning inline.");
    expect(text).toContain("Preview: # Page B");
    expect(text).not.toContain("Page B — could not write temp file");
  });
});

describe("tool_result offload interceptor", () => {
  it("offloads large code_search/get_search_content results and leaves small ones unchanged", async () => {
    const handler = await getToolResultHandler();

    offloadState.shouldOffload.mockReturnValueOnce(true);
    offloadState.offloadToFile.mockReturnValueOnce("/tmp/pi-web-large.txt");
    offloadState.buildOffloadResult.mockReturnValueOnce("preview + file path");

    const largeIntercept = await handler({
      toolName: "code_search",
      isError: false,
      content: [{ type: "text", text: "X".repeat(40_000) }],
    });

    expect(offloadState.offloadToFile).toHaveBeenCalledWith("X".repeat(40_000));
    expect(largeIntercept).toEqual({
      content: [{ type: "text", text: "preview + file path" }],
    });

    offloadState.shouldOffload.mockReturnValueOnce(false);
    const smallIntercept = await handler({
      toolName: "get_search_content",
      isError: false,
      content: [{ type: "text", text: "short" }],
    });

    expect(smallIntercept).toBeUndefined();
  });
});