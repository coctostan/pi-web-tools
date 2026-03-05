---
id: 17
title: get_search_content still returns full content from in-memory store after
  file-first
status: approved
depends_on:
  - 8
  - 11
no_test: false
files_to_modify:
  - index.test.ts
files_to_create: []
---

### Task 17: get_search_content still returns full content from in-memory store after file-first [depends: 8, 11]
**AC covered:** AC 19
**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

In `index.test.ts`, add a helper and test:

```typescript
async function getFetchAndGetSearchContentTools() {
  vi.resetModules();

  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => {
      tools.set(def.name, def);
    }),
    appendEntry: vi.fn(),
  };

  // Intentionally use current default config (get_search_content disabled) so this fails first.
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);

  const fetchContentTool = tools.get("fetch_content");
  const getSearchContentTool = tools.get("get_search_content");

  if (!fetchContentTool) throw new Error("fetch_content tool was not registered");
  if (!getSearchContentTool) throw new Error("get_search_content tool was not registered");

  return { fetchContentTool, getSearchContentTool };
}

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
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "get_search_content still returns full content from in-memory store after file-first fetch"`

Expected: FAIL — `Error: get_search_content tool was not registered`.

**Step 3 — Write minimal implementation**

In the same helper, enable `get_search_content` registration by temporarily mutating `configState.value.tools` (from Task 8), then restore it:

```typescript
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
```

No production code changes are needed.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "get_search_content still returns full content from in-memory store after file-first fetch"`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.
