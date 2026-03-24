---
id: 8
title: "index.ts: integrate cache into single-URL fetch_content + prompt flow"
status: approved
depends_on:
  - 2
  - 5
  - 7
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

### Task 8: index.ts: integrate cache into single-URL fetch_content + prompt flow [depends: 2, 5, 7]

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

In `index.test.ts`:

1. Add a mock for `research-cache.js` near the other `vi.mock` blocks at the top (after the offload mock around line 88):

```typescript
const cacheState = vi.hoisted(() => ({
  getCached: vi.fn(() => null),
  putCache: vi.fn(),
}));

vi.mock("./research-cache.js", () => ({
  getCached: cacheState.getCached,
  putCache: cacheState.putCache,
}));
```

2. Also update the `configState` to include `cacheTTLMinutes`:

In the existing `configState` hoisted value (around line 19), add `cacheTTLMinutes: 1440` to the `value` object:

```typescript
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
```

3. Add a new describe block:

```typescript
describe("fetch_content research cache integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: FAIL — `expect(state.extractContent).not.toHaveBeenCalled()` fails because cache is not integrated yet

**Step 3 — Write minimal implementation**

In `index.ts`:

1. Add import for research-cache at the top (after the filter import):

```typescript
import { getCached, putCache } from "./research-cache.js";
```

2. Add a helper to compute the default cache file path (after the `pendingFetches` declaration):

```typescript
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_CACHE_FILE = join(homedir(), ".pi", "cache", "web-tools", "research-cache.json");
```

Note: `join` and `homedir` — check if they're already imported. `join` is not imported in index.ts. `homedir` is not imported. Add them.

3. In the single-URL + prompt flow (around line 503, the `if (prompt)` block), add cache check BEFORE the `filterContent` call:

Replace the single-URL prompt block (lines 503-573) with logic that checks cache first:

```typescript
          if (prompt) {
            const config = getConfig();

            // Check research cache (unless noCache)
            if (!noCache) {
              const resolvedModel = config.filterModel ?? "anthropic/claude-haiku-4-5";
              const cachedAnswer = getCached(r.url, prompt, resolvedModel, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
              if (cachedAnswer !== null) {
                return {
                  content: [{ type: "text", text: `Source: ${r.url}\n\n${cachedAnswer}` }],
                  details: {
                    responseId,
                    url: r.url,
                    title: r.title,
                    charCount: cachedAnswer.length,
                    filtered: true,
                    cached: true,
                    ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null }], successCount: 1, totalCount: 1 },
                  },
                };
              }
            }

            const filterResult = await filterContent(
              r.content,
              prompt,
              ctx.modelRegistry,
              config.filterModel,
              complete
            );

            if (filterResult.filtered !== null) {
              // Store in cache
              putCache(r.url, prompt, filterResult.model, filterResult.filtered, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);

              return {
                content: [{ type: "text", text: `Source: ${r.url}\n\n${filterResult.filtered}` }],
                details: {
                  responseId,
                  url: r.url,
                  title: r.title,
                  charCount: filterResult.filtered.length,
                  filtered: true,
                  filterModel: filterResult.model,
                  ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: null, filtered: filterResult.filtered, filePath: null, charCount: filterResult.filtered.length, error: null }], successCount: 1, totalCount: 1 },
                },
              };
            }

            // ... rest of filter-failure fallback remains unchanged ...
```

Keep the existing filter-failure fallback logic (lines 528-573) unchanged after the `filterResult.filtered !== null` block.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
