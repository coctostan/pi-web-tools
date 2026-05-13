---
id: 12
title: Adopt prepareArguments for web_search
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Wire `normalizeWebSearchInput` into `web_search.registerTool({...})` as `prepareArguments`, and remove the in-execute call. (AC-PREPARE-1, AC-PREPARE-2 for web_search.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "web_search ToolDefinition exposes prepareArguments"`
Expected: FAIL — `expect(typeof webSearchTool.prepareArguments).toBe("function")` — received "undefined".

**Step 3 — Write minimal implementation**

In `index.ts`, inside `pi.registerTool({ name: "web_search", ... })`, add a `prepareArguments` field between `parameters` and `async execute`:

```ts
parameters: WebSearchParams,
prepareArguments: (raw) => normalizeWebSearchInput(raw as any) as any,
async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
  const { queries: queryList, numResults, type, category, includeDomains, excludeDomains, detail, maxAgeHours, similarUrl } = params as any;
  // ...remainder of execute body unchanged
```

Remove the line `const { queries: queryList, numResults, ... } = normalizeWebSearchInput(params);` (currently line 183) — the destructure is now from `params` directly.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "web_search ToolDefinition exposes prepareArguments"` and `-t "web_search.execute consumes normalized params directly"`
Expected: both PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
