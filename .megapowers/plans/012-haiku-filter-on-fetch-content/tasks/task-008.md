---
id: 8
title: Wire filterContent into fetch_content single-URL path
status: approved
depends_on:
  - 4
  - 7
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

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
