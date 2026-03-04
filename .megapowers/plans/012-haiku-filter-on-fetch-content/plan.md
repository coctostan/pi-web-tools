# Plan

### Task 1: Add filterModel field to config

### Task 1: Add filterModel field to config

**Files:**
- Modify: `config.ts`
- Test: `config.test.ts`

**Step 1 — Write the failing test**

Add to `config.test.ts`:

```typescript
it("reads filterModel from config when present", () => {
  writeFileSync(configPath, JSON.stringify({ filterModel: "anthropic/claude-haiku-4-5" }));
  resetConfigCache();
  const config = getConfig();
  expect(config.filterModel).toBe("anthropic/claude-haiku-4-5");
});

it("defaults filterModel to undefined when missing", () => {
  writeFileSync(configPath, JSON.stringify({}));
  resetConfigCache();
  const config = getConfig();
  expect(config.filterModel).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run config.test.ts`

Expected: FAIL — `Property 'filterModel' does not exist on type 'WebToolsConfig'`

**Step 3 — Write minimal implementation**

In `config.ts`, add `filterModel` to the `WebToolsConfig` interface and `buildConfig()`:

1. Add to `WebToolsConfig` interface:
```typescript
export interface WebToolsConfig {
  exaApiKey: string | null;
  filterModel?: string;
  github: GitHubConfig;
  tools: ToolToggles;
}
```

2. Add to `DEFAULT_CONFIG`:
```typescript
const DEFAULT_CONFIG: WebToolsConfig = {
  exaApiKey: null,
  filterModel: undefined,
  // ... rest unchanged
};
```

3. Add to `buildConfig()` before the `return` statement:
```typescript
const filterModel = typeof file["filterModel"] === "string" && file["filterModel"].includes("/")
  ? file["filterModel"]
  : undefined;
```

4. Update the return to include `filterModel`:
```typescript
return { exaApiKey, filterModel, github, tools };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run config.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all 112 tests passing

### Task 2: Create filter module — resolveFilterModel with configured model [depends: 1]

### Task 2: Create filter module — resolveFilterModel with configured model [depends: 1]

**Files:**
- Create: `filter.ts`
- Create: `filter.test.ts`

**Step 1 — Write the failing test**

Create `filter.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { resolveFilterModel } from "./filter.js";

describe("resolveFilterModel", () => {
  it("uses configured filterModel when available", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
    };

    const result = await resolveFilterModel(mockRegistry as any, "anthropic/claude-haiku-4-5");
    expect(result).toEqual({ model: mockModel, apiKey: "test-key" });
    expect(mockRegistry.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — `Error: Failed to resolve module './filter.js'` (module doesn't exist)

**Step 3 — Write minimal implementation**

Create `filter.ts`:

```typescript
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";

type MinimalModel = { id: string; provider: string };

export type FilterModelResult =
  | { model: MinimalModel; apiKey: string }
  | { model: null; reason: string };

export async function resolveFilterModel(
  registry: ModelRegistry,
  configuredModel?: string
): Promise<FilterModelResult> {
  // 1. Try configured model
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (provider && modelId) {
      const model = registry.find(provider, modelId);
      if (model) {
        const apiKey = await registry.getApiKey(model);
        if (apiKey) {
          return { model, apiKey };
        }
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }

  return { model: null, reason: "No filter model configured" };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing

### Task 3: resolveFilterModel auto-detects Haiku then GPT-4o-mini [depends: 2]

### Task 3: resolveFilterModel auto-detects Haiku then GPT-4o-mini [depends: 2]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts`:

```typescript
it("auto-detects Haiku when no config and Haiku key is available", async () => {
  const haikuModel = { id: "claude-haiku-4-5", provider: "anthropic" };
  const mockRegistry = {
    find: vi.fn().mockImplementation((provider: string, modelId: string) => {
      if (provider === "anthropic" && modelId === "claude-haiku-4-5") return haikuModel;
      return undefined;
    }),
    getApiKey: vi.fn().mockResolvedValue("haiku-key"),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: haikuModel, apiKey: "haiku-key" });
  expect(mockRegistry.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5");
});

it("falls back to GPT-4o-mini when Haiku is unavailable", async () => {
  const gptModel = { id: "gpt-4o-mini", provider: "openai" };
  const mockRegistry = {
    find: vi.fn().mockImplementation((provider: string, modelId: string) => {
      if (provider === "anthropic" && modelId === "claude-haiku-4-5") return undefined;
      if (provider === "openai" && modelId === "gpt-4o-mini") return gptModel;
      return undefined;
    }),
    getApiKey: vi.fn().mockResolvedValue("openai-key"),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: gptModel, apiKey: "openai-key" });
});

it("returns no-model when neither Haiku nor GPT-4o-mini is available", async () => {
  const mockRegistry = {
    find: vi.fn().mockReturnValue(undefined),
    getApiKey: vi.fn().mockResolvedValue(undefined),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: null, reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)" });
});

it("skips Haiku when model exists but no API key, falls to GPT-4o-mini", async () => {
  const haikuModel = { id: "claude-haiku-4-5", provider: "anthropic" };
  const gptModel = { id: "gpt-4o-mini", provider: "openai" };
  const mockRegistry = {
    find: vi.fn().mockImplementation((provider: string, modelId: string) => {
      if (provider === "anthropic" && modelId === "claude-haiku-4-5") return haikuModel;
      if (provider === "openai" && modelId === "gpt-4o-mini") return gptModel;
      return undefined;
    }),
    getApiKey: vi.fn().mockImplementation(async (model: any) => {
      if (model.id === "claude-haiku-4-5") return undefined;
      if (model.id === "gpt-4o-mini") return "openai-key";
      return undefined;
    }),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: gptModel, apiKey: "openai-key" });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — the auto-detect tests fail because `resolveFilterModel` currently returns `{ model: null, reason: "No filter model configured" }` when no configured model is passed.

**Step 3 — Write minimal implementation**

Update `resolveFilterModel` in `filter.ts` to add auto-detection fallback after the configured model check:

```typescript
const AUTO_DETECT_MODELS = [
  { provider: "anthropic", modelId: "claude-haiku-4-5" },
  { provider: "openai", modelId: "gpt-4o-mini" },
] as const;

export async function resolveFilterModel(
  registry: ModelRegistry,
  configuredModel?: string
): Promise<FilterModelResult> {
  // 1. Try configured model
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (provider && modelId) {
      const model = registry.find(provider, modelId);
      if (model) {
        const apiKey = await registry.getApiKey(model);
        if (apiKey) {
          return { model, apiKey };
        }
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }

  // 2. Auto-detect: try each candidate
  for (const candidate of AUTO_DETECT_MODELS) {
    const model = registry.find(candidate.provider, candidate.modelId);
    if (!model) continue;
    const apiKey = await registry.getApiKey(model);
    if (apiKey) {
      return { model, apiKey };
    }
  }

  return { model: null, reason: `No filter model available (tried ${AUTO_DETECT_MODELS.map(m => `${m.provider}/${m.modelId}`).join(", ")})` };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing

### Task 4: Add filterContent function — successful filtering [depends: 3]

### Task 4: Add filterContent function — successful filtering [depends: 3]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts`:

```typescript
import { resolveFilterModel, filterContent } from "./filter.js";

describe("filterContent", () => {
  it("returns filtered answer on successful completion", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
    };

    const mockComplete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "The answer is 42." }],
    });

    const result = await filterContent(
      "This is a long page about the meaning of life...",
      "What is the answer?",
      mockRegistry as any,
      undefined,
      mockComplete
    );

    expect(result).toEqual({ filtered: "The answer is 42.", model: "anthropic/claude-haiku-4-5" });
    
    // Verify correct messages were passed to complete
    const [model, context, options] = mockComplete.mock.calls[0];
    expect(model).toBe(mockModel);
    expect(options.apiKey).toBe("test-key");
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0].role).toBe("user");
    // System prompt should be in context
    expect(context.systemPrompt).toBeDefined();
    expect(context.systemPrompt).toContain("ONLY");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — `filterContent is not a function` (not yet exported)

**Step 3 — Write minimal implementation**

Add to `filter.ts`:

```typescript
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";

type CompleteFn = (model: Model<Api>, context: Context, options?: ProviderStreamOptions) => Promise<AssistantMessage>;

export type FilterResult =
  | { filtered: string; model: string }
  | { filtered: null; reason: string };

const FILTER_SYSTEM_PROMPT = `You are a content extraction assistant. Your job is to answer the user's question using ONLY the provided page content.

Rules:
- Answer using ONLY information found in the provided content
- Include relevant code snippets verbatim — do not paraphrase or modify code
- Be concise and direct — typically 200-1000 characters
- If the content does not answer the question, say "The provided content does not contain information about [topic]."
- Do not use any knowledge from your training data — only the provided content`;

export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn
): Promise<FilterResult> {
  const resolved = await resolveFilterModel(registry, configuredModel);
  if (!resolved.model || !("apiKey" in resolved)) {
    return { filtered: null, reason: resolved.reason };
  }

  const { model, apiKey } = resolved as { model: Model<Api>; apiKey: string };

  const context: Context = {
    systemPrompt: FILTER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `<page_content>\n${content}\n</page_content>\n\nQuestion: ${prompt}` }],
        timestamp: Date.now(),
      },
    ],
  };

  const response = await completeFn(model, context, { apiKey });

  const answer = response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  return { filtered: answer, model: `${model.provider}/${model.id}` };
}
```

Also update the import at the top and ensure `ModelRegistry` type is imported properly. The full type import should use:

```typescript
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing

### Task 5: filterContent handles API errors with graceful fallback [depends: 4]

### Task 5: filterContent handles API errors with graceful fallback [depends: 4]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts` inside the `filterContent` describe block:

```typescript
it("returns fallback when complete() throws an error", async () => {
  const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
  const mockRegistry = {
    find: vi.fn().mockReturnValue(mockModel),
    getApiKey: vi.fn().mockResolvedValue("test-key"),
  };

  const mockComplete = vi.fn().mockRejectedValue(new Error("Rate limit exceeded"));

  const result = await filterContent(
    "Some page content",
    "What is this?",
    mockRegistry as any,
    undefined,
    mockComplete
  );

  expect(result).toEqual({ filtered: null, reason: "Filter model error: Rate limit exceeded" });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — unhandled rejection because `filterContent` does not catch errors from `completeFn`

**Step 3 — Write minimal implementation**

Wrap the `completeFn` call and response processing in a try-catch in `filterContent`:

```typescript
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn
): Promise<FilterResult> {
  const resolved = await resolveFilterModel(registry, configuredModel);
  if (!resolved.model || !("apiKey" in resolved)) {
    return { filtered: null, reason: resolved.reason };
  }

  const { model, apiKey } = resolved as { model: Model<Api>; apiKey: string };

  try {
    const context: Context = {
      systemPrompt: FILTER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `<page_content>\n${content}\n</page_content>\n\nQuestion: ${prompt}` }],
          timestamp: Date.now(),
        },
      ],
    };

    const response = await completeFn(model, context, { apiKey });

    const answer = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return { filtered: answer, model: `${model.provider}/${model.id}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filtered: null, reason: `Filter model error: ${msg}` };
  }
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing

### Task 6: filterContent handles empty/short responses with fallback [depends: 4]

### Task 6: filterContent handles empty/short responses with fallback [depends: 4]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts` inside the `filterContent` describe block:

```typescript
it("returns fallback when filter response is too short (< 20 chars)", async () => {
  const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
  const mockRegistry = {
    find: vi.fn().mockReturnValue(mockModel),
    getApiKey: vi.fn().mockResolvedValue("test-key"),
  };

  const mockComplete = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "OK" }],
  });

  const result = await filterContent(
    "Some page content here",
    "What is this about?",
    mockRegistry as any,
    undefined,
    mockComplete
  );

  expect(result).toEqual({ filtered: null, reason: "Filter response too short (2 chars)" });
});

it("returns fallback when filter response is empty", async () => {
  const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
  const mockRegistry = {
    find: vi.fn().mockReturnValue(mockModel),
    getApiKey: vi.fn().mockResolvedValue("test-key"),
  };

  const mockComplete = vi.fn().mockResolvedValue({
    content: [],
  });

  const result = await filterContent(
    "Some page content here",
    "What is this about?",
    mockRegistry as any,
    undefined,
    mockComplete
  );

  expect(result).toEqual({ filtered: null, reason: "Filter response too short (0 chars)" });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — the short response test fails because `filterContent` currently returns `{ filtered: "OK", model: "anthropic/claude-haiku-4-5" }` instead of a fallback.

**Step 3 — Write minimal implementation**

Add a length check after extracting the answer text in `filterContent`, before the success return:

```typescript
const MIN_FILTER_RESPONSE_LENGTH = 20;

// Inside filterContent, after extracting `answer`:
if (answer.length < MIN_FILTER_RESPONSE_LENGTH) {
  return { filtered: null, reason: `Filter response too short (${answer.length} chars)` };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing

### Task 7: Add prompt parameter to FetchContentParams schema

### Task 7: Add prompt parameter to FetchContentParams schema

**Files:**
- Modify: `index.ts`
- Modify: `tool-params.ts`
- Modify: `tool-params.test.ts`

**Step 1 — Write the failing test**

Add to `tool-params.test.ts`:

```typescript
describe("normalizeFetchContentInput", () => {
  // ... existing tests ...

  it("extracts prompt string when provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      prompt: "What is the API rate limit?",
    });
    expect(result.prompt).toBe("What is the API rate limit?");
  });

  it("defaults prompt to undefined when not provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
    });
    expect(result.prompt).toBeUndefined();
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tool-params.test.ts`

Expected: FAIL — `Property 'prompt' does not exist on type '{ urls: string[]; forceClone: boolean | undefined; }'`

**Step 3 — Write minimal implementation**

1. In `tool-params.ts`, update `normalizeFetchContentInput`:

```typescript
export function normalizeFetchContentInput(params: { url?: unknown; urls?: unknown; forceClone?: unknown; prompt?: unknown }) {
  const url = typeof params.url === "string" ? params.url : undefined;
  const urls = Array.isArray(params.urls)
    ? params.urls.filter((u): u is string => typeof u === "string")
    : undefined;

  const urlList = (urls && urls.length > 0) ? urls : (url ? [url] : []);
  if (urlList.length === 0) {
    throw new Error("Either 'url' or 'urls' must be provided.");
  }

  const forceClone = typeof params.forceClone === "boolean" ? params.forceClone : undefined;
  const prompt = typeof params.prompt === "string" ? params.prompt : undefined;
  return { urls: dedupeUrls(urlList), forceClone, prompt };
}
```

2. In `index.ts`, update `FetchContentParams` schema:

```typescript
const FetchContentParams = Type.Object({
  url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
  forceClone: Type.Optional(Type.Boolean({ description: "Force cloning large GitHub repos" })),
  prompt: Type.Optional(Type.String({ description: "Question to answer from the fetched content. When provided, content is filtered through a cheap model and only the focused answer is returned (~200-1000 chars instead of full page)." })),
});
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tool-params.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing

### Task 8: Wire filterContent into fetch_content single-URL path [depends: 4, 7]

### Task 8: Wire filterContent into fetch_content single-URL path [depends: 4, 7]
**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`
**Step 1 — Write the failing test**

Replace `index.test.ts` with a real integration-style tool execution test using **hoisted stable mocks**:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  extractContent: vi.fn(),
  filterContent: vi.fn(),
}));
vi.mock("./config.js", () => ({
  getConfig: () => ({
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
  }),
  resetConfigCache: vi.fn(),
}));
vi.mock("./extract.js", () => ({
  extractContent: state.extractContent,
  fetchAllContent: vi.fn(),
}));
vi.mock("./filter.js", () => ({
  filterContent: state.filterContent,
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
function getText(result: any): string {
  const first = result?.content?.[0];
  return first?.type === "text" ? first.text : "";
}
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

    const noModelFallback = await fetchContentTool.execute(
      "call-2",
      { url: "https://example.com/docs", prompt: "What is the rate limit?" },
      undefined,
      undefined,
      ctx
    );
    expect(getText(noModelFallback)).toBe(
      "⚠ No filter model available. Returning raw content.\n\n# Docs\n\nRAW PAGE"
    );
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
    expect(getText(rawResult)).toBe("# Docs\n\nRAW PAGE");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`

Expected: FAIL — `expected "spy" to be called at least once`

**Step 3 — Write minimal implementation**

Implement the single-URL wiring in `index.ts`:
1. Add imports at the top:
```typescript
import { complete } from "@mariozechner/pi-ai";
import { filterContent } from "./filter.js";
```
2. In `fetch_content` execute handler, rename `_ctx` to `ctx` and read `prompt` from normalized params:
```typescript
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  const { urls: dedupedUrls, forceClone, prompt } = normalizeFetchContentInput(params);
```
3. Replace the single-URL branch in `fetch_content` with:
```typescript
if (results.length === 1) {
  const r = results[0];
  if (r.error) {
    return {
      content: [{ type: "text", text: `Error fetching ${r.url}: ${r.error}` }],
      details: { responseId, url: r.url, error: r.error },
    };
  }
  if (prompt) {
    const config = getConfig();
    const filterResult = await filterContent(
      r.content,
      prompt,
      ctx.modelRegistry,
      config.filterModel,
      complete
    );
    if (filterResult.filtered) {
      return {
        content: [{ type: "text", text: `Source: ${r.url}\n\n${filterResult.filtered}` }],
        details: {
          responseId,
          url: r.url,
          title: r.title,
          charCount: filterResult.filtered.length,
          filtered: true,
          filterModel: filterResult.model,
        },
      };
    }
    const reason = filterResult.reason.startsWith("No filter model available")
      ? "No filter model available. Returning raw content."
      : filterResult.reason;
    let text = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
    let truncated = false;

    if (text.length > MAX_INLINE_CONTENT) {
      text = text.slice(0, MAX_INLINE_CONTENT);
      text += `\n\n[Content truncated at ${MAX_INLINE_CONTENT} chars. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
      truncated = true;
    }

    return {
      content: [{ type: "text", text }],
      details: {
        responseId,
        url: r.url,
        title: r.title,
        charCount: r.content.length,
        truncated,
        filtered: false,
      },
    };
  }
  let text = `# ${r.title}\n\n${r.content}`;
  let truncated = false;

  if (text.length > MAX_INLINE_CONTENT) {
    text = text.slice(0, MAX_INLINE_CONTENT);
    text += `\n\n[Content truncated at ${MAX_INLINE_CONTENT} chars. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
    truncated = true;
  }

  return {
    content: [{ type: "text", text }],
    details: {
      responseId,
      url: r.url,
      title: r.title,
      charCount: r.content.length,
      truncated,
    },
  };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all passing

### Task 9: Wire filterContent into fetch_content multi-URL path with p-limit(3) [depends: 5, 6, 8]

### Task 9: Wire filterContent into fetch_content multi-URL path with p-limit(3) [depends: 5, 6, 8]

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`
**Step 1 — Write the failing test**

In `index.test.ts`, add a mocked `p-limit` and two multi-URL tests (prompt mode + no-prompt regression). Keep using the same hoisted `state` mocks introduced in Task 8.

Add near top-level mocks:

```typescript
const pLimitState = vi.hoisted(() => ({
  pLimitSpy: vi.fn((concurrency: number) => {
    return <T>(fn: () => Promise<T>) => fn();
  }),
}));
vi.mock("p-limit", () => ({
  default: pLimitState.pLimitSpy,
}));
```

Add these tests in the `fetch_content` describe block:

```typescript
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
  expect(text).toContain(
    "⚠ No filter model available. Returning raw content.\n\n# B Docs\n\nRAW B"
  );
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

  expect(text).toContain("Fetched 2/3 URLs. Response ID:");
  expect(text).toContain("1. ✅ A Docs (5 chars)");
  expect(text).toContain("2. ✅ B Docs (5 chars)");
  expect(text).toContain("3. ❌ https://c.example/docs: timeout");
  expect(text).toContain("Use get_search_content with responseId");
  expect(state.filterContent).not.toHaveBeenCalled();
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`

Expected: FAIL — `expected text to contain "Fetched 2/3 URLs. Response ID:"`

**Step 3 — Write minimal implementation**

Implement prompt-aware multi-URL wiring in `index.ts`, while preserving the existing no-prompt summary path.
1. Add import at top of `index.ts`:
```typescript
import pLimit from "p-limit";
```

2. In `fetch_content` execute, replace the multi-URL branch with:

```typescript
// Multiple URLs
if (prompt) {
  const config = getConfig();
  const limit = pLimit(3);
  const blocks = await Promise.all(
    results.map((r) =>
      limit(async () => {
        if (r.error) {
          return `❌ ${r.url}: ${r.error}`;
        }
        const filterResult = await filterContent(
          r.content,
          prompt,
          ctx.modelRegistry,
          config.filterModel,
          complete
        );
      if (filterResult.filtered) {
          return `Source: ${r.url}\n\n${filterResult.filtered}`;
        }
        const reason = filterResult.reason.startsWith("No filter model available")
          ? "No filter model available. Returning raw content."
          : filterResult.reason;
        return `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
      })
    )
  );

  const successCount = results.filter((r) => !r.error).length;

  return {
    content: [{ type: "text", text: blocks.join("\n\n---\n\n") }],
    details: {
      responseId,
      successCount,
      totalCount: results.length,
      filtered: true,
    },
  };
}
// No prompt: existing summary behavior (unchanged)
const successCount = results.filter((r) => !r.error).length;
const lines: string[] = [];
lines.push(`Fetched ${successCount}/${results.length} URLs. Response ID: ${responseId}`);
lines.push("");
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (r.error) {
    lines.push(`${i + 1}. ❌ ${r.url}: ${r.error}`);
  } else {
    lines.push(`${i + 1}. ✅ ${r.title} (${r.content.length} chars)`);
    lines.push(`   ${r.url}`);
  }
}

lines.push("");
lines.push(`Use get_search_content with responseId "${responseId}" and url/urlIndex to retrieve content.`);
return {
  content: [{ type: "text", text: lines.join("\n") }],
  details: {
    responseId,
    successCount,
    totalCount: results.length,
  },
};
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all passing

### Task 10: Update fetch_content tool description with prompt guidance [no-test] [depends: 7]

### Task 10: Update fetch_content tool description with prompt guidance [no-test]

**Justification:** Text-only change to the tool description string. No observable behavior change — just nudges the agent to use the `prompt` parameter.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

Update the `description` field in the `fetch_content` tool registration in `index.ts`:

```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.",
```

Change to:

```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).",
```

**Step 2 — Verify**

Run: `npx vitest run`

Expected: all tests passing (no behavior change)
