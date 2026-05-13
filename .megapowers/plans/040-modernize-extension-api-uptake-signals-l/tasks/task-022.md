---
id: 22
title: "Compaction regression test: get_search_content resolves pre-compaction
  responseId"
status: approved
depends_on:
  - 18
  - 19
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

End-to-end regression test simulating the `/compact` sequence. (AC-COMPACT-5)

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "get_search_content resolves a pre-compaction responseId via disk-backed store"`
Expected: FAIL — `expect(beforeCompact).toBeDefined()` receives `undefined` because the extension does not yet register `session_before_compact` / `session_compact` handlers.

**Step 3 — Write minimal implementation**

In `index.ts`, after the existing `session_shutdown` registration, add best-effort compaction handlers that use the disk-backed store from Tasks 18–19:

```ts
pi.on("session_before_compact", async (_event, ctx) => {
  snapshotStore(ctx);
});

pi.on("session_compact", async (_event, ctx) => {
  rehydrateFromDisk(ctx);
});
```

`snapshotStore(ctx)` is the module-scope helper from Task 18 that writes `getAllResults()` to `results-<sessionId>.json`. `rehydrateFromDisk(ctx)` is the module-scope boolean helper from Task 19 that loads the same file into `storage.ts` without using `ctx.sessionManager.getEntries()` when the disk snapshot exists. These handlers must be registered after the helpers are declared/imported and before tests inspect `handlers.get("session_before_compact")` / `handlers.get("session_compact")`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "get_search_content resolves a pre-compaction responseId via disk-backed store"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
