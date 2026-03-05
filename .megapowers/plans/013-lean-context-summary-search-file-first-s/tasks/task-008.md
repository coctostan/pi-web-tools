---
id: 8
title: web_search tool schema includes detail parameter and passes it to searchExa
status: approved
depends_on:
  - 1
  - 3
no_test: false
files_to_modify:
  - index.ts
  - tool-params.ts
  - index.test.ts
files_to_create: []
---

### Task 8: web_search tool schema includes detail parameter and passes it to searchExa [depends: 1, 3]
**AC covered:** AC 8, AC 9
**Files:**
- Modify: `index.ts`
- Modify: `tool-params.ts`
- Test: `index.test.ts`
**Step 1 — Write failing tests**

In `index.test.ts`, switch config mocking to a single hoisted mutable state (no `vi.doMock`) and add schema + pass-through tests.

1) Replace the current top-level config mock with:

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
  },
}));
vi.mock("./config.js", () => ({
  getConfig: () => configState.value,
  resetConfigCache: vi.fn(),
}));
```

2) Add exa mocks + helper:

```typescript
const exaState = vi.hoisted(() => ({
  searchExa: vi.fn(),
  formatSearchResults: vi.fn(),
}));
vi.mock("./exa-search.js", () => ({
  searchExa: exaState.searchExa,
  formatSearchResults: exaState.formatSearchResults,
}));
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
  if (!webSearchTool) throw new Error("web_search tool was not registered");
  return { webSearchTool };
}
```

3) Add tests:

```typescript
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
```

**Step 2 — Run tests, verify they fail**

Run:
- `npx vitest run index.test.ts -t "web_search schema exposes detail enum summary|highlights"`
  - Expected: FAIL — `expected undefined to be defined`
- `npx vitest run index.test.ts -t "web_search execute passes normalized detail to searchExa"`
  - Expected: FAIL — expected call containing `detail: "highlights"`, but received options have no `detail`

**Step 3 — Write minimal implementation**

1. In `tool-params.ts`, extend `normalizeWebSearchInput`:

```typescript
const VALID_DETAIL_VALUES = new Set(["summary", "highlights"]);
export function normalizeWebSearchInput(params: {
  query?: unknown;
  queries?: unknown;
  numResults?: unknown;
  type?: unknown;
  category?: unknown;
  includeDomains?: unknown;
  excludeDomains?: unknown;
  detail?: unknown;
}) {
  // existing parsing...
  const detail = typeof params.detail === "string" && VALID_DETAIL_VALUES.has(params.detail)
    ? (params.detail as "summary" | "highlights")
  : undefined;
  return {
    queries: queryList,
    numResults,
    type,
    category,
    includeDomains,
    excludeDomains,
    detail,
  };
}
```

2. In `index.ts`, add `detail` to `WebSearchParams`:

```typescript
detail: Type.Optional(Type.Union([
  Type.Literal("summary"),
  Type.Literal("highlights"),
], { description: 'Detail level: "summary" (default) or "highlights"' })),
```

3. In `index.ts`, pass `detail` through to `searchExa`:

```typescript
const { queries: queryList, numResults, type, category, includeDomains, excludeDomains, detail } = normalizeWebSearchInput(params);
const searchResults = await searchExa(q, {
  apiKey: config.exaApiKey,
  numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
  type,
  category,
  includeDomains,
  excludeDomains,
  signal: combinedSignal,
  detail,
});
```

**Step 4 — Run tests, verify they pass**

Run the same two commands from Step 2.

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.
