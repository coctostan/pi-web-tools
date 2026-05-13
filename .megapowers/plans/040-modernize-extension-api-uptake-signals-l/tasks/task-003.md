---
id: 3
title: "code_search: forward execute()'s signal directly to searchContext"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Forward the pi-provided `signal` directly to `searchContext` inside `code_search.execute(...)`. (AC-CANCEL-3)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Add a new helper near the top of `index.test.ts` (after `getFetchAndGetSearchContentTools`):

```ts
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
```

And mock `./exa-context.js` near the other `vi.mock` calls at the top of the file (only if not already mocked — check first; if it exists, skip this):

```ts
const exaContextState = vi.hoisted(() => ({
  searchContext: vi.fn(),
}));
vi.mock("./exa-context.js", () => ({
  searchContext: exaContextState.searchContext,
}));
```

Then add the test:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "forwards the execute() signal directly to searchContext"`
Expected: FAIL — received the wrapper signal, not `externalSignal`.

**Step 3 — Write minimal implementation**

In `index.ts`, inside `code_search`'s `async execute(_toolCallId, params, signal, _onUpdate, _ctx)`:

1. Remove:

```ts
const abortController = new AbortController();
const fetchId = generateId();
pendingFetches.set(fetchId, abortController);

const combinedSignal = signal
  ? AbortSignal.any([signal, abortController.signal])
  : abortController.signal;
```

2. Change `signal: combinedSignal` (inside the `searchContext({...})` call) to `signal`.

3. Remove the outer `try { ... } finally { pendingFetches.delete(fetchId); }` wrapper. The inner `try { ... } catch (err) { ... }` for error handling stays.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "forwards the execute() signal directly to searchContext"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
