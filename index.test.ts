import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync as _readFileSyncForCancelCheck, mkdtempSync as _mkdtempCompact, rmSync as _rmSyncCompact, existsSync as _existsCompact } from "node:fs";
import { tmpdir as _tmpdirCompact } from "node:os";
import { join as _joinCompact } from "node:path";

const state = vi.hoisted(() => ({
  extractContent: vi.fn(),
  filterContent: vi.fn(),
  clearUrlCache: vi.fn(),
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
    cacheTTLMinutes: 1440,
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

const exaContextState = vi.hoisted(() => ({
  searchContext: vi.fn(),
}));
vi.mock("./exa-context.js", () => ({
  searchContext: exaContextState.searchContext,
}));

const offloadState = vi.hoisted(() => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: vi.fn(),
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));

vi.mock("./exa-search.js", () => ({
  searchExa: exaState.searchExa,
  findSimilarExa: exaState.findSimilarExa,
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
  clearUrlCache: state.clearUrlCache,
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

const cacheState = vi.hoisted(() => ({
  getCached: vi.fn((_url: string, _prompt: string, _model: string, _ttl: number, _path: string): string | null => null),
  putCache: vi.fn(),
}));

vi.mock("./research-cache.js", () => ({
  getCached: cacheState.getCached,
  putCache: cacheState.putCache,
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

  const originalExecuteFn = fetchContentTool.execute;
  const originalExecute = originalExecuteFn.bind(fetchContentTool);
  const wrappedExecute = (_toolCallId: string, params: any, ...rest: any[]) => originalExecute(
    _toolCallId,
    fetchContentTool.prepareArguments(params),
    ...rest,
  );
  wrappedExecute.toString = () => originalExecuteFn.toString();
  fetchContentTool.execute = wrappedExecute;

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
  const originalExecuteFn = fetchContentTool.execute;
  const originalExecute = originalExecuteFn.bind(fetchContentTool);
  const wrappedExecute = (_toolCallId: string, params: any, ...rest: any[]) => originalExecute(
    _toolCallId,
    fetchContentTool.prepareArguments(params),
    ...rest,
  );
  wrappedExecute.toString = () => originalExecuteFn.toString();
  fetchContentTool.execute = wrappedExecute;
  return { fetchContentTool, getSearchContentTool };
}


async function getCodeSearchTool() {
  vi.resetModules();
  const previousTools = { ...configState.value.tools };
  configState.value.tools = {
    web_search: false,
    fetch_content: false,
    code_search: true,
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
  const codeSearchTool = tools.get("code_search");
  if (!codeSearchTool) throw new Error("code_search tool was not registered");
  return { codeSearchTool };
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

async function getSessionHandlers() {
  vi.resetModules();
  const handlers = new Map<string, any>();
  const pi = {
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  return handlers;
}

describe("session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("session_start reason dispatch (#036 AC-LIFECYCLE-7)", () => {
    beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

    async function getSessionHandlerWithStorageSpies() {
      const actualStorage = await vi.importActual<typeof import("./storage.js")>("./storage.js");
      const clearResultsSpy = vi.fn(actualStorage.clearResults);
      const restoreFromSessionSpy = vi.fn();
      const restoreFromSessionFileSpy = vi.fn();

      vi.doMock("./storage.js", async () => ({
        ...actualStorage,
        clearResults: clearResultsSpy,
        restoreFromSession: restoreFromSessionSpy,
        restoreFromSessionFile: restoreFromSessionFileSpy,
      }));

      const handlers = new Map<string, any>();
      const pi = {
        on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
        registerTool: vi.fn(),
        appendEntry: vi.fn(),
      };
      const { default: registerExtension } = await import("./index.js");
      registerExtension(pi as any);
      const handler = handlers.get("session_start");
      if (!handler) throw new Error("session_start handler not registered");
      return { handler, clearResultsSpy, restoreFromSessionSpy, restoreFromSessionFileSpy };
    }

    const cases = [
      { reason: "startup", clearUrl: true, cleanup: true, clearResults: false, restore: true },
      { reason: "reload", clearUrl: false, cleanup: false, clearResults: false, restore: true },
      { reason: "new", clearUrl: true, cleanup: true, clearResults: true, restore: false },
      { reason: "resume", clearUrl: true, cleanup: true, clearResults: false, restore: true },
      { reason: "fork", clearUrl: true, cleanup: true, clearResults: false, restore: true },
    ] as const;

    it.each(cases)("routes session_start reason=$reason to the correct lifecycle calls", async ({ reason, clearUrl, cleanup, clearResults: shouldClearResults, restore }) => {
      const { handler, clearResultsSpy, restoreFromSessionSpy, restoreFromSessionFileSpy } = await getSessionHandlerWithStorageSpies();

      const ctx = { sessionManager: { getEntries: vi.fn(() => []), getSessionId: () => `${reason}-sid` } };
      await handler({ type: "session_start", reason }, ctx as any);

      expect(ghState.clearCloneCache).toHaveBeenCalledTimes(1);
      if (clearUrl) expect(state.clearUrlCache).toHaveBeenCalledTimes(1);
      else expect(state.clearUrlCache).not.toHaveBeenCalled();

      if (cleanup) expect(offloadState.cleanupTempFiles).toHaveBeenCalledTimes(1);
      else expect(offloadState.cleanupTempFiles).not.toHaveBeenCalled();

      if (shouldClearResults) expect(clearResultsSpy).toHaveBeenCalledTimes(1);
      else expect(clearResultsSpy).not.toHaveBeenCalled();

      if (restore) expect(restoreFromSessionSpy).toHaveBeenCalledWith(ctx);
      else expect(restoreFromSessionSpy).not.toHaveBeenCalled();
      expect(restoreFromSessionFileSpy).not.toHaveBeenCalled();
    });

    // The fork + previousSessionFile assertion is covered by Task 10 after
    // restoreFromSessionFile exists; this task covers the fork fallback branch.
  });


  it('session_start with reason="reload" preserves URL cache and temp files but still clears clone cache and restores results (#036 AC-LIFECYCLE-3)', async () => {
    vi.resetModules();
    vi.doUnmock("./storage.js");
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    expect(handler).toBeDefined();

    const getEntries = vi.fn(() => []);
    const ctx = { sessionManager: { getEntries, getSessionId: () => "reload-sid" } };
    await handler({ type: "session_start", reason: "reload" }, ctx as any);

    expect(state.clearUrlCache).not.toHaveBeenCalled();
    expect(offloadState.cleanupTempFiles).not.toHaveBeenCalled();
    expect(ghState.clearCloneCache).toHaveBeenCalled();
    expect(getEntries).toHaveBeenCalled();
  });

  it("session_shutdown does NOT call any cache-clearing function from research-cache", async () => {
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_shutdown");
    expect(handler).toBeDefined();

    await handler({});

    expect(cacheState.getCached).not.toHaveBeenCalled();
    expect(cacheState.putCache).not.toHaveBeenCalled();
  });

  it("does NOT register removed lifecycle events session_switch/session_fork/session_tree", async () => {
    const handlers = await getSessionHandlers();
    expect(handlers.has("session_switch")).toBe(false);
    expect(handlers.has("session_fork")).toBe(false);
    expect(handlers.has("session_tree")).toBe(false);
  });
});


describe('session_start "fork" branch (#036 AC-LIFECYCLE-6)', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  async function getForkHandlerWithStorageSpies() {
    const restoreFromSessionSpy = vi.fn();
    const restoreFromSessionFileSpy = vi.fn();
    vi.doMock("./storage.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./storage.js")>();
      return {
        ...actual,
        restoreFromSession: restoreFromSessionSpy,
        restoreFromSessionFile: restoreFromSessionFileSpy,
      };
    });

    const handlers = new Map<string, any>();
    const pi = {
      on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
      registerTool: vi.fn(),
      appendEntry: vi.fn(),
    };
    const { default: registerExtension } = await import("./index.js");
    registerExtension(pi as any);
    const handler = handlers.get("session_start");
    if (!handler) throw new Error("session_start handler not registered");
    return { handler, restoreFromSessionSpy, restoreFromSessionFileSpy };
  }

  it('calls restoreFromSessionFile(event.previousSessionFile) when set', async () => {
    const { handler, restoreFromSessionSpy, restoreFromSessionFileSpy } = await getForkHandlerWithStorageSpies();
    const ctx = { sessionManager: { getEntries: () => [], getSessionId: () => "child" } };

    await handler({ type: "session_start", reason: "fork", previousSessionFile: "/tmp/parent.session" }, ctx as any);

    expect(restoreFromSessionFileSpy).toHaveBeenCalledWith("/tmp/parent.session");
    expect(restoreFromSessionSpy).not.toHaveBeenCalled();
  });

  it('falls back to restoreFromSession(ctx) when previousSessionFile is absent', async () => {
    const { handler, restoreFromSessionSpy, restoreFromSessionFileSpy } = await getForkHandlerWithStorageSpies();
    const ctx = { sessionManager: { getEntries: () => [], getSessionId: () => "child" } };

    await handler({ type: "session_start", reason: "fork" }, ctx as any);

    expect(restoreFromSessionFileSpy).not.toHaveBeenCalled();
    expect(restoreFromSessionSpy).toHaveBeenCalledWith(ctx);
  });
});

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

  it("web_search schema keeps numResults optional while constraining provided values", async () => {
    const { webSearchTool } = await getWebSearchTool();
    const numResultsSchema = webSearchTool.parameters.properties.numResults;

    expect(webSearchTool.parameters.required ?? []).not.toContain("numResults");
    expect(numResultsSchema).toMatchObject({ minimum: 1, maximum: 20 });
  });

  it("web_search execute passes normalized detail to searchExa", async () => {
    exaState.searchExa.mockResolvedValueOnce([
      { title: "Result", url: "https://example.com", snippet: "summary" },
    ]);
    exaState.formatSearchResults.mockReturnValue(
      "1. **Result**\n   https://example.com\n   summary"
    );

    const { webSearchTool } = await getWebSearchTool();

    await webSearchTool.execute("call-web", webSearchTool.prepareArguments({ query: "x", detail: "highlights" }));

    expect(exaState.searchExa).toHaveBeenCalledWith(
      "x",
      expect.objectContaining({ detail: "highlights" })
    );
  });

  it("batch queries run concurrently via p-limit(3)", async () => {
    let seenConcurrency: number | undefined;
    pLimitState.pLimitSpy.mockImplementation((concurrency: number) => {
      seenConcurrency = concurrency;
      return <T>(fn: () => Promise<T>) => fn();
    });

    exaState.searchExa.mockResolvedValue([
      { title: "Result", url: "https://example.com", snippet: "test" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted result");

    const { webSearchTool } = await getWebSearchTool();
    await webSearchTool.execute("call-batch", webSearchTool.prepareArguments({
      queries: ["query1", "query2", "query3"],
    }));

    expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
    expect(seenConcurrency).toBe(3);
    expect(exaState.searchExa).toHaveBeenCalledTimes(3);
  });

  it("batch query partial failure reports error and continues other queries", async () => {
    pLimitState.pLimitSpy.mockImplementation((_concurrency: number) => {
      return <T>(fn: () => Promise<T>) => fn();
    });

    exaState.searchExa
      .mockResolvedValueOnce([{ title: "Result 1", url: "https://example.com/1", snippet: "s1" }])
      .mockRejectedValueOnce(new Error("Exa API error (503)"))
      .mockResolvedValueOnce([{ title: "Result 3", url: "https://example.com/3", snippet: "s3" }]);

    exaState.formatSearchResults
      .mockReturnValueOnce("Result 1 formatted")
      .mockReturnValueOnce("Result 3 formatted");

    const { webSearchTool } = await getWebSearchTool();
    const result = await webSearchTool.execute("call-partial", webSearchTool.prepareArguments({
      queries: ["q1", "q2", "q3"],
    }));

    const text = getText(result);
    expect(text).toContain("## Query: q1");
    expect(text).toContain("Result 1 formatted");
    expect(text).toContain("## Query: q2");
    expect(text).toContain("Error: Exa API error (503)");
    expect(text).toContain("## Query: q3");
    expect(text).toContain("Result 3 formatted");
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
      expect.any(Function),
      undefined
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
      expect.any(Function),
      undefined
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

  it("multi-URL fetch uses p-limit(3) for bounded concurrency", async () => {
    let fetchPLimitConcurrency: number | undefined;
    pLimitState.pLimitSpy.mockImplementation((concurrency: number) => {
      fetchPLimitConcurrency = concurrency;
      return <T>(fn: () => Promise<T>) => fn();
    });

    state.extractContent.mockImplementation(async (url: string) => ({
      url,
      title: `Title for ${url}`,
      content: `Content for ${url}`,
      error: null,
    }));

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

    await fetchContentTool.execute(
      "call-multi",
      { urls: ["https://example.com/1", "https://example.com/2", "https://example.com/3"] },
      undefined,
      undefined,
      ctx
    );

    expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
    expect(fetchPLimitConcurrency).toBe(3);
    expect(state.extractContent).toHaveBeenCalledTimes(3);
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

describe("web_search similarUrl routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls findSimilarExa (not searchExa) when similarUrl is provided", async () => {
    exaState.findSimilarExa.mockResolvedValueOnce([
      { title: "Similar", url: "https://similar.com", snippet: "similar content" },
    ]);
    exaState.formatSearchResults.mockReturnValue("1. **Similar**\n   https://similar.com\n   similar content");

    const { webSearchTool } = await getWebSearchTool();
    await webSearchTool.execute("call-similar", webSearchTool.prepareArguments({ similarUrl: "https://example.com" }));

    expect(exaState.findSimilarExa).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ apiKey: null })
    );
    expect(exaState.searchExa).not.toHaveBeenCalled();
  });

  it("calls searchExa (not findSimilarExa) when query is provided", async () => {
    exaState.searchExa.mockResolvedValueOnce([
      { title: "Result", url: "https://example.com", snippet: "result" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted");

    const { webSearchTool } = await getWebSearchTool();
    await webSearchTool.execute("call-query", webSearchTool.prepareArguments({ query: "foo" }));

    expect(exaState.searchExa).toHaveBeenCalled();
    expect(exaState.findSimilarExa).not.toHaveBeenCalled();
  });
  it("returns queryCount 1 (not 0) when similarUrl is used", async () => {
    exaState.findSimilarExa.mockResolvedValueOnce([
      { title: "Similar", url: "https://similar.com", snippet: "similar" },
      { title: "Similar 2", url: "https://similar2.com", snippet: "similar 2" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted");

    const { webSearchTool } = await getWebSearchTool();
    const result = await webSearchTool.execute("call-qc", webSearchTool.prepareArguments({ similarUrl: "https://example.com" }));

    expect((result as any).details.queryCount).toBe(1);
  });

  it("passes includeDomains and excludeDomains to findSimilarExa when similarUrl is provided", async () => {
    exaState.findSimilarExa.mockResolvedValueOnce([]);
    exaState.formatSearchResults.mockReturnValue("No results found.");

    const { webSearchTool } = await getWebSearchTool();
    await webSearchTool.execute("call-domains", webSearchTool.prepareArguments({
      similarUrl: "https://example.com",
      includeDomains: ["github.com"],
      excludeDomains: ["pinterest.com"],
    }));

    expect(exaState.findSimilarExa).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        includeDomains: ["github.com"],
        excludeDomains: ["pinterest.com"],
      })
    );
  });

  it("includes a warning note when freshness is used with similarUrl", async () => {
    exaState.findSimilarExa.mockResolvedValueOnce([]);
    exaState.formatSearchResults.mockReturnValue("No results found.");

    const { webSearchTool } = await getWebSearchTool();
    const result = await webSearchTool.execute("call-freshness-warn", webSearchTool.prepareArguments({
      similarUrl: "https://example.com",
      freshness: "day",
    }));

    const text = getText(result);
    expect(text).toMatch(/freshness.*not supported/i);
  });

  it("includes a warning note when category is used with similarUrl", async () => {
    exaState.findSimilarExa.mockResolvedValueOnce([]);
    exaState.formatSearchResults.mockReturnValue("No results found.");

    const { webSearchTool } = await getWebSearchTool();
    const result = await webSearchTool.execute("call-category-warn", webSearchTool.prepareArguments({
      similarUrl: "https://example.com",
      category: "news",
    }));

    const text = getText(result);
    expect(text).toMatch(/category.*not supported/i);
  });
});

describe("fetch_content research cache integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheState.getCached.mockReset().mockReturnValue(null);
    cacheState.putCache.mockReset();
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

  it("noCache skips cache read but still writes to cache after fresh fetch", async () => {
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

    expect(cacheState.getCached).not.toHaveBeenCalled();
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
  });

  it("multi-URL + prompt: independently checks cache per URL, mixing hits and misses", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.example/docs") {
        return { url, title: "A Docs", content: "RAW A", error: null };
      }
      return { url, title: "B Docs", content: "RAW B", error: null };
    });

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
    expect(text).toContain("Cached A answer");
    expect(text).toContain("Fresh B answer");

    expect(state.filterContent).toHaveBeenCalledTimes(1);
    expect(state.filterContent).toHaveBeenCalledWith(
      "RAW B",
      "What are the rate limits?",
      ctx.modelRegistry,
      undefined,
      expect.any(Function),
      undefined
    );

    expect(cacheState.putCache).toHaveBeenCalledWith(
      "https://b.example/docs",
      "What are the rate limits?",
      "anthropic/claude-haiku-4-5",
      "Fresh B answer",
      1440,
      expect.any(String)
    );
  });
});


describe("web_search cancellation (#033)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("forwards the execute() signal directly to searchExa (no AbortSignal.any wrapping)", async () => {
    const { webSearchTool } = await getWebSearchTool();
    exaState.searchExa.mockResolvedValueOnce([]);
    exaState.formatSearchResults.mockReturnValueOnce("");

    const externalSignal = new AbortController().signal;
    await webSearchTool.execute(
      "call-1",
      { queries: ["hello"], numResults: 5, type: undefined, category: undefined, includeDomains: undefined, excludeDomains: undefined, detail: undefined, maxAgeHours: undefined, similarUrl: undefined },
      externalSignal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" } } as any,
    );

    expect(exaState.searchExa).toHaveBeenCalledTimes(1);
    const passedOpts = exaState.searchExa.mock.calls[0][1];
    // The exact same signal must be forwarded — no AbortSignal.any wrapping.
    expect(passedOpts.signal).toBe(externalSignal);
  });
});


describe("web_search prepareArguments (#037)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("web_search ToolDefinition exposes prepareArguments and invokes normalizeWebSearchInput", async () => {
    const { webSearchTool } = await getWebSearchTool();
    expect(typeof webSearchTool.prepareArguments).toBe("function");
    const normalized = webSearchTool.prepareArguments({ query: "hello" });
    expect(normalized.queries).toEqual(["hello"]);
  });

  it("web_search.execute consumes normalized params directly (does not re-call normalizeWebSearchInput)", async () => {
    const { webSearchTool } = await getWebSearchTool();
    const src = webSearchTool.execute.toString();
    expect(src).not.toMatch(/normalizeWebSearchInput/);
  });
});


describe("web_search prepareArguments typing (#037)", () => {
  it("web_search queryList map callback is explicitly typed after params are prepared", () => {
    const src = _readFileSyncForCancelCheck("index.ts", "utf-8");
    expect(src).toMatch(/queryList\.map\(\(q: string\) =>/);
  });
});


describe("fetch_content prepareArguments (#037)", () => {
  it("fetch_content ToolDefinition exposes prepareArguments that normalizes url -> urls[]", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    expect(typeof fetchContentTool.prepareArguments).toBe("function");
    const normalized = fetchContentTool.prepareArguments({ url: "https://example.com" });
    expect(normalized.urls).toEqual(["https://example.com"]);
  });

  it("fetch_content prepareArguments throws the documented error when neither url nor urls is provided (AC-PREPARE-5)", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    expect(() => fetchContentTool.prepareArguments({})).toThrow(/Either 'url' or 'urls' must be provided/);
  });

  it("fetch_content.execute does not re-normalize", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    expect(fetchContentTool.execute.toString()).not.toMatch(/normalizeFetchContentInput/);
  });
});


describe("fetch_content prepareArguments typing (#037)", () => {
  it("fetch_content dedupedUrls map callback is explicitly typed after params are prepared", () => {
    const src = _readFileSyncForCancelCheck("index.ts", "utf-8");
    expect(src).toMatch(/dedupedUrls\.map\(\(url: string\) =>/);
  });
});


describe("fetch_content cancellation (#033 AC-CANCEL-2)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("forwards the execute() signal directly to extractContent", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    state.extractContent.mockResolvedValueOnce({ url: "https://example.com", title: "T", content: "C", error: null });
    offloadState.shouldOffload.mockReturnValue(false);

    const externalSignal = new AbortController().signal;
    await fetchContentTool.execute(
      "call-1",
      { urls: ["https://example.com"], forceClone: undefined, prompt: undefined, noCache: true },
      externalSignal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" }, modelRegistry: {} } as any,
    );

    expect(state.extractContent).toHaveBeenCalledTimes(1);
    expect(state.extractContent.mock.calls[0][1]).toBe(externalSignal);
  });

  it("passes the execute() signal through filterContent for focused fetch completion", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    state.extractContent.mockResolvedValueOnce({ url: "https://example.com", title: "T", content: "raw page", error: null });
    state.filterContent.mockResolvedValueOnce({ filtered: "focused answer long enough", model: "anthropic/claude-haiku-4-5" });

    const externalSignal = new AbortController().signal;
    await fetchContentTool.execute(
      "call-filter-signal",
      { urls: ["https://example.com"], forceClone: undefined, prompt: "summarize", noCache: true },
      externalSignal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" }, modelRegistry: {} } as any,
    );

    expect(state.filterContent).toHaveBeenCalledTimes(1);
    expect(state.filterContent.mock.calls[0][5]).toBe(externalSignal);
  });
});


describe("code_search cancellation (#033)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("forwards the execute() signal directly to searchContext", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    exaContextState.searchContext.mockResolvedValueOnce({ query: "q", content: "c" });

    const externalSignal = new AbortController().signal;
    await codeSearchTool.execute(
      "call-1",
      { query: "q", tokensNum: undefined },
      externalSignal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" } } as any,
    );

    expect(exaContextState.searchContext).toHaveBeenCalledTimes(1);
    expect(exaContextState.searchContext.mock.calls[0][1].signal).toBe(externalSignal);
  });
});


describe("get_search_content cancellation (#033 AC-CANCEL-4/7)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns an aborted result when execute() receives an already-aborted signal", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    const storage = await import("./storage.js");
    storage.storeResult("abort-me", {
      id: "abort-me",
      type: "search",
      timestamp: Date.now(),
      queries: [{ query: "q", answer: "answer", results: [], error: null }],
    });

    const controller = new AbortController();
    controller.abort();

    const result = await getSearchContentTool.execute(
      "call-aborted-get",
      { responseId: "abort-me" },
      controller.signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" } } as any,
    );

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toMatch(/abort/i);
    expect(result.details).toEqual({});
  });
});


describe("per-tool in-flight cancellation (#033 AC-CANCEL-7)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("web_search surfaces AbortError from searchExa when the execute() signal aborts", async () => {
    const { webSearchTool } = await getWebSearchTool();
    const controller = new AbortController();

    exaState.searchExa.mockImplementation(async (_query: string, opts: { signal?: AbortSignal }) => {
      await new Promise<never>((_, reject) => {
        opts.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          (e as any).name = "AbortError";
          reject(e);
        }, { once: true });
      });
      throw new Error("unreachable");
    });

    const promise = webSearchTool.execute(
      "call-web-abort",
      { queries: ["hello"], numResults: 5, type: undefined, category: undefined, includeDomains: undefined, excludeDomains: undefined, detail: undefined, maxAgeHours: undefined, similarUrl: undefined },
      controller.signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" } } as any,
    );
    queueMicrotask(() => controller.abort());

    const result = await promise;
    expect(getText(result)).toMatch(/abort/i);
  });

  it("fetch_content surfaces AbortError from extractContent when the execute() signal aborts", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    const controller = new AbortController();

    state.extractContent.mockImplementation(async (_url: string, sig: AbortSignal) => {
      await new Promise<never>((_, reject) => {
        sig.addEventListener("abort", () => {
          const e = new Error("aborted");
          (e as any).name = "AbortError";
          reject(e);
        }, { once: true });
      });
      throw new Error("unreachable");
    });

    const promise = fetchContentTool.execute(
      "call-fetch-abort",
      { urls: ["https://example.com"], forceClone: undefined, prompt: undefined, noCache: true },
      controller.signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" }, modelRegistry: {} } as any,
    );
    queueMicrotask(() => controller.abort());

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("code_search surfaces AbortError from searchContext when the execute() signal aborts", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    const controller = new AbortController();

    exaContextState.searchContext.mockImplementation(async (_query: string, opts: { signal?: AbortSignal }) => {
      await new Promise<never>((_, reject) => {
        opts.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          (e as any).name = "AbortError";
          reject(e);
        }, { once: true });
      });
      throw new Error("unreachable");
    });

    const resultPromise = codeSearchTool.execute(
      "call-code-abort",
      { query: "useState", tokensNum: undefined },
      controller.signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" } } as any,
    );
    queueMicrotask(() => controller.abort());

    const result = await resultPromise;
    expect(result.isError).toBe(true);
    expect(getText(result)).toMatch(/abort/i);
  });

  it("get_search_content returns an aborted result for an already-aborted execute() signal", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    const storage = await import("./storage.js");
    storage.storeResult("abort-get", {
      id: "abort-get",
      type: "search",
      timestamp: Date.now(),
      queries: [{ query: "q", answer: "answer", results: [], error: null }],
    });

    const controller = new AbortController();
    controller.abort();
    const result = await getSearchContentTool.execute(
      "call-get-abort",
      { responseId: "abort-get" },
      controller.signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" } } as any,
    );

    expect(result.isError).toBe(true);
    expect(getText(result)).toMatch(/abort/i);
  });
});


describe('session_start "new" (#036 AC-LIFECYCLE-4)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('clears the in-memory result store and does NOT call restoreFromSession', async () => {
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    expect(handler).toBeDefined();

    // Seed after getSessionHandlers() so index.ts and the test share the same storage.ts module instance.
    const storage = await import("./storage.js");
    storage.storeResult("pre-new", { id: "pre-new", type: "search", timestamp: Date.now(), queries: [] });
    expect(storage.getResult("pre-new")).not.toBeNull();

    const getEntries = vi.fn(() => [{ type: "custom", customType: "web-tools-results", data: { id: "should-not-restore", type: "search", timestamp: Date.now(), queries: [] } }]);
    await handler({ type: "session_start", reason: "new" }, { sessionManager: { getEntries, getSessionId: () => "new-sid" } } as any);

    expect(storage.getResult("pre-new")).toBeNull();
    expect(getEntries).not.toHaveBeenCalled();
  });
});


describe("code_search prepareArguments (#037)", () => {
  it("code_search ToolDefinition exposes prepareArguments and accepts a valid query", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    expect(typeof codeSearchTool.prepareArguments).toBe("function");
    expect(codeSearchTool.prepareArguments({ query: "useState" }).query).toBe("useState");
  });

  it("code_search prepareArguments throws when query is missing", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    expect(() => codeSearchTool.prepareArguments({})).toThrow(/'query' must be provided/);
  });

  it("code_search.execute does not re-normalize", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    expect(codeSearchTool.execute.toString()).not.toMatch(/normalizeCodeSearchInput/);
  });
});


describe("get_search_content prepareArguments (#037)", () => {
  it("get_search_content ToolDefinition exposes prepareArguments", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    expect(typeof getSearchContentTool.prepareArguments).toBe("function");
    expect(getSearchContentTool.prepareArguments({ responseId: "abc" }).responseId).toBe("abc");
  });

  it("get_search_content prepareArguments throws when responseId missing", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    expect(() => getSearchContentTool.prepareArguments({})).toThrow(/'responseId' must be provided/);
  });

  it("get_search_content.execute does not re-normalize", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    expect(getSearchContentTool.execute.toString()).not.toMatch(/normalizeGetSearchContentInput/);
  });
});


describe("storeResult disk snapshot (#032 AC-COMPACT-2)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("writes a snapshot to results-<sessionId>.json after web_search storeResult", async () => {
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-snap-"));
    const { webSearchTool } = await getWebSearchTool();
    exaState.searchExa.mockResolvedValueOnce([]);
    exaState.formatSearchResults.mockReturnValueOnce("");

    await webSearchTool.execute(
      "call-snap-web",
      { queries: ["q"], numResults: 5, type: undefined, category: undefined, includeDomains: undefined, excludeDomains: undefined, detail: undefined, maxAgeHours: undefined, similarUrl: undefined },
      new AbortController().signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "snap-web" }, webToolsResultsDir: dir } as any,
    );

    expect(_existsCompact(_joinCompact(dir, "results-snap-web.json"))).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });

  it("writes a snapshot to results-<sessionId>.json after fetch_content storeResult", async () => {
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-snap-"));
    const { fetchContentTool } = await getFetchContentTool();
    state.extractContent.mockResolvedValueOnce({ url: "https://example.com", title: "T", content: "C", error: null });

    await fetchContentTool.execute(
      "call-snap-fetch",
      { urls: ["https://example.com"], forceClone: undefined, prompt: undefined, noCache: true },
      new AbortController().signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "snap-fetch" }, modelRegistry: {}, webToolsResultsDir: dir } as any,
    );

    expect(_existsCompact(_joinCompact(dir, "results-snap-fetch.json"))).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });

  it("writes a snapshot to results-<sessionId>.json after code_search storeResult", async () => {
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-snap-"));
    const { codeSearchTool } = await getCodeSearchTool();
    exaContextState.searchContext.mockResolvedValueOnce({ query: "useState", content: "context" });

    await codeSearchTool.execute(
      "call-snap-code",
      { query: "useState", tokensNum: undefined },
      new AbortController().signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "snap-code" }, webToolsResultsDir: dir } as any,
    );

    expect(_existsCompact(_joinCompact(dir, "results-snap-code.json"))).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});


describe("session_start rehydrates from disk (#032 AC-COMPACT-3/6)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads results-<sessionId>.json without reading the session log on reason="resume"', async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-rehydrate-"));
    const { writeStoreSnapshot, resultsFilePath } = await import("./session-results-store.js");
    const sessionId = "rehydrate-sid";
    writeStoreSnapshot(resultsFilePath(sessionId, dir), [
      { id: "from-disk", type: "search", timestamp: Date.now(), queries: [{ query: "q", answer: "a", results: [], error: null }] },
    ] as any);

    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    const getEntries = vi.fn(() => { throw new Error("session log should not be required when disk snapshot exists"); });
    const ctx = { sessionManager: { getEntries, getSessionId: () => sessionId }, webToolsResultsDir: dir };
    await handler({ type: "session_start", reason: "resume" }, ctx as any);

    const storage = await import("./storage.js");
    expect(storage.getResult("from-disk")).not.toBeNull();
    expect(getEntries).not.toHaveBeenCalled();

    _rmSyncCompact(dir, { recursive: true, force: true });
  });


  it("ignores expired or malformed disk snapshot entries during session_start rehydrate", async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-stale-disk-"));
    const { writeStoreSnapshot, resultsFilePath } = await import("./session-results-store.js");
    const storage = await import("./storage.js");
    const sessionId = "stale-disk-sid";
    writeStoreSnapshot(resultsFilePath(sessionId, dir), [
      { id: "expired", type: "search", timestamp: Date.now() - 2 * 60 * 60 * 1000, queries: [] } as any,
      { id: "bad-fetch", type: "fetch", timestamp: Date.now() } as any,
    ]);

    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    await handler({ type: "session_start", reason: "resume" }, { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any);

    expect(storage.getResult("expired")).toBeNull();
    expect(storage.getResult("bad-fetch")).toBeNull();
    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});


describe("session_shutdown disk cleanup (#032 AC-COMPACT-4)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("keeps results-<sessionId>.json on quit shutdown so a compacted session can be reopened", async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-shutdown-"));
    const { writeStoreSnapshot, resultsFilePath } = await import("./session-results-store.js");
    const sessionId = "shutdown-sid";
    const filePath = resultsFilePath(sessionId, dir);
    writeStoreSnapshot(filePath, []);
    expect(_existsCompact(filePath)).toBe(true);

    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_shutdown");
    await handler({ type: "session_shutdown", reason: "quit" }, { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any);

    expect(_existsCompact(filePath)).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });

  it("keeps the current session snapshot on reload shutdown so startup can rehydrate it", async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-reload-shutdown-"));
    const { writeStoreSnapshot, resultsFilePath } = await import("./session-results-store.js");
    const sessionId = "reload-shutdown-sid";
    const filePath = resultsFilePath(sessionId, dir);
    writeStoreSnapshot(filePath, []);

    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_shutdown");
    await handler({ type: "session_shutdown", reason: "reload" }, { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any);

    expect(_existsCompact(filePath)).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});


describe("compaction-safe state (#032 AC-COMPACT-5)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("get_search_content resolves a pre-compaction responseId via disk-backed store", async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-compact-"));
    const sessionId = "compact-sid";

    // 1. Register both tools under the same module instance.
    const previousTools = { ...configState.value.tools };
    configState.value.tools = { web_search: true, fetch_content: false, code_search: false, get_search_content: true };

    const tools = new Map<string, any>();
    const handlers = new Map<string, any>();
    const pi = {
      on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
      registerTool: vi.fn((def: any) => tools.set(def.name, def)),
      appendEntry: vi.fn(),
    };
    const { default: registerExtension } = await import("./index.js");
    registerExtension(pi as any);
    configState.value.tools = previousTools;

    const webSearchTool = tools.get("web_search");
    const getSearchContentTool = tools.get("get_search_content");
    expect(webSearchTool && getSearchContentTool).toBeTruthy();

    exaState.searchExa.mockResolvedValueOnce([{ title: "T", url: "https://example.com", snippet: "s" }]);
    exaState.formatSearchResults.mockReturnValueOnce("body");

    // 2. Drive a web_search call.
    const ctx = { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any;
    const searchResult = await webSearchTool.execute(
      "call-pre-compact",
      webSearchTool.prepareArguments({ query: "hello" }),
      new AbortController().signal,
      undefined,
      ctx,
    );
    const responseId = searchResult.details.responseId as string;
    expect(typeof responseId).toBe("string");

    // 3. Simulate compaction events. The appendEntry records are unreachable after compact,
    //    so clear the in-memory store between the events and rely on the disk snapshot.
    const beforeCompact = handlers.get("session_before_compact");
    const compact = handlers.get("session_compact");
    expect(beforeCompact).toBeDefined();
    expect(compact).toBeDefined();

    const storage = await import("./storage.js");
    await beforeCompact({ type: "session_before_compact" }, ctx);
    storage.clearResults();
    await compact({ type: "session_compact" }, ctx);
    expect(storage.getResult(responseId)).not.toBeNull();

    // 4. get_search_content must now resolve the pre-compaction responseId.
    const fetched = await getSearchContentTool.execute(
      "call-post-compact",
      getSearchContentTool.prepareArguments({ responseId }),
      undefined,
      undefined,
      ctx,
    );
    expect(fetched.isError).not.toBe(true);

    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});


describe("index.ts shrinkage (#040 AC-BATCH-4)", () => {
  it("index.ts is strictly shorter than the v4.0.0 baseline of 1192 lines", () => {
    const src = _readFileSyncForCancelCheck("index.ts", "utf-8");
    const lineCount = src.endsWith("\n") ? src.split("\n").length - 1 : src.split("\n").length;
    expect(lineCount).toBeLessThan(1192);
  });
});