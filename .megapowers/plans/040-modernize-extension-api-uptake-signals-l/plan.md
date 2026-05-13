# Plan

### Task 1: web_search: forward execute()'s signal directly to Exa calls

Drop the manual `AbortController` / `pendingFetches` plumbing inside `web_search.execute(...)` and forward the pi-provided `signal` directly to `searchExa` / `findSimilarExa`. (AC-CANCEL-1)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts` inside a new `describe`:

```ts
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
```

Note: this test currently consumes the **post-normalization** params shape because `web_search.execute` today still calls `normalizeWebSearchInput(params)` internally; passing the normalized shape is a no-op through normalize. After Task 12 lands, the test continues to work because `prepareArguments` produces the same shape.

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "forwards the execute() signal directly to searchExa"`
Expected: FAIL — `expect(passedOpts.signal).toBe(externalSignal)` — received an `AbortSignal` created by `AbortSignal.any([externalSignal, abortController.signal])`, not strictly equal to `externalSignal`.

**Step 3 — Write minimal implementation**

In `index.ts`, inside `web_search`'s `async execute(_toolCallId, params, signal, _onUpdate, _ctx)` body, remove these lines:

```ts
const abortController = new AbortController();
const fetchId = generateId();
pendingFetches.set(fetchId, abortController);

const combinedSignal = signal
  ? AbortSignal.any([signal, abortController.signal])
  : abortController.signal;
```

Replace every later occurrence of `combinedSignal` inside this `execute` body with `signal` (two occurrences: the `findSimilarExa({...signal: combinedSignal...})` call and the `searchExa({...signal: combinedSignal...})` call).

Remove the `try { ... } finally { pendingFetches.delete(fetchId); }` wrapper that surrounds the results assembly; the body inside `try` becomes the body of `execute` (no `finally` needed because there is no `pendingFetches` entry to clean up). The `try { ... } catch` blocks **inside** the function (around `findSimilarExa` / per-query `searchExa`) are unrelated and must remain.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "forwards the execute() signal directly to searchExa"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 2: fetch_content: forward execute()'s signal directly to extractors and filter completion [depends: 1]

Forward the pi-provided `signal` directly to `extractContent`, `extractGitHub`, `filterContent`, and the `complete(...)` call made inside `filterContent`. (AC-CANCEL-2)

**Files:**
- Modify: `index.ts`
- Modify: `filter.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing tests**

Append to `index.test.ts`:

```ts
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
```

**Step 2 — Run tests, verify they fail**
Run: `npx vitest run index.test.ts -t "fetch_content cancellation \(#033 AC-CANCEL-2\)"`
Expected: FAIL — the first test reports `expect(state.extractContent.mock.calls[0][1]).toBe(externalSignal)` received the wrapper `AbortSignal.any(...)` signal; after that is fixed, the second test reports `expect(state.filterContent.mock.calls[0][5]).toBe(externalSignal)` received `undefined` because `fetch_content.execute` currently calls `filterContent(..., complete)` with only five arguments.

**Step 3 — Write minimal implementation**

In `index.ts`, inside `fetch_content`'s `async execute(_toolCallId, params, signal, _onUpdate, ctx)`:

1. Remove the lines:

```ts
const abortController = new AbortController();
const fetchId = generateId();
pendingFetches.set(fetchId, abortController);

const combinedSignal = signal
  ? AbortSignal.any([signal, abortController.signal])
  : abortController.signal;
```

2. Inside `fetchOne`, replace:

```ts
const ghResult = await extractGitHub(targetUrl, combinedSignal, forceClone);
return extractContent(targetUrl, combinedSignal);
```

with:

```ts
const ghResult = await extractGitHub(targetUrl, signal, forceClone);
return extractContent(targetUrl, signal);
```

3. Remove the outer `try { ... } finally { pendingFetches.delete(fetchId); }` wrapper — the body inside `try` becomes the body of `execute`. Inner `try/catch` blocks for individual URL handling stay.

4. At both `filterContent(...)` call sites in `fetch_content.execute`, pass `signal` as the sixth argument:

```ts
const filterResult = await filterContent(
  r.content,
  prompt,
  ctx.modelRegistry,
  config.filterModel,
  complete,
  signal,
);
```

In `filter.ts`, update the real signature and the `completeFn` options. Replace:

```ts
type CompleteFn = (model: Model<Api>, context: Context, options?: ProviderStreamOptions) => Promise<AssistantMessage>;
```

with the same type alias (no type change required), then change `filterContent` from:

```ts
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn
): Promise<FilterResult> {
```

to:

```ts
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn,
  signal?: AbortSignal
): Promise<FilterResult> {
```

and replace:

```ts
const response = await completeFn(model, context, { apiKey, headers });
```

with:

```ts
const response = await completeFn(model, context, { apiKey, headers, signal });
```

**Step 4 — Run tests, verify they pass**
Run: `npx vitest run index.test.ts -t "fetch_content cancellation \(#033 AC-CANCEL-2\)"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 3: code_search: forward execute()'s signal directly to searchContext [depends: 2]

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

### Task 4: get_search_content: drop unused signal-wrapping plumbing [depends: 3]

`get_search_content.execute(...)` has no downstream fetch/complete call to pass a signal into; it only reads from the in-memory store via `getResult(...)`. Make that AC-CANCEL-7 exception explicit by observing an already-aborted `signal` at the top of the executor and returning an aborted result, while also asserting the tool body contains no manual `pendingFetches` / `AbortSignal.any` plumbing. (AC-CANCEL-4, AC-CANCEL-7)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
    expect(getSearchContentTool.execute.toString()).not.toMatch(/pendingFetches|abortAllPending|AbortSignal\.any/);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "returns an aborted result when execute\(\) receives an already-aborted signal"`
Expected: FAIL — `expect(result.isError).toBe(true)` receives `undefined` because `get_search_content.execute` currently ignores `_signal` and returns the stored content.

**Step 3 — Write minimal implementation**

In `index.ts`, inside `get_search_content`'s `pi.registerTool` definition, rename the execute parameter from `_signal` to `signal` and add an early return before reading normalized params or calling `getResult(...)`:

```ts
async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
  if (signal?.aborted) {
    return {
      content: [{ type: "text" as const, text: "Operation aborted." }],
      isError: true,
    };
  }

  const { responseId, query, queryIndex, url, urlIndex, maxChars } = normalizeGetSearchContentInput(params);
  // existing body continues unchanged
}
```

This is the explicit AC-CANCEL-7 behavior for `get_search_content`: there is no downstream network operation to cancel, so the tool observes an already-aborted per-call signal and returns an aborted result without adding any manual controller plumbing.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "returns an aborted result when execute\(\) receives an already-aborted signal"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 5: Remove pendingFetches Map and abortAllPending helper [depends: 1, 2, 3, 4]

After tasks 1–4 remove all callers of `pendingFetches.set` / `pendingFetches.delete`, delete the module-scope `Map` and the `abortAllPending()` helper, and remove their calls from `handleSessionStart` / `handleSessionShutdown`. (AC-CANCEL-5, AC-CANCEL-6)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
import { readFileSync as _readFileSyncForCancelCheck } from "node:fs";

describe("cancellation cleanup (#033 AC-CANCEL-5/6)", () => {
  it("index.ts has no references to pendingFetches or abortAllPending", () => {
    const src = _readFileSyncForCancelCheck("index.ts", "utf-8");
    expect(src).not.toMatch(/pendingFetches/);
    expect(src).not.toMatch(/abortAllPending/);
  });
});
```

(If `readFileSync` is already imported elsewhere in the file, reuse the existing import.)

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "index.ts has no references to pendingFetches or abortAllPending"`
Expected: FAIL — `expect(src).not.toMatch(/pendingFetches/)` matches at module scope and in `handleSessionStart` / `handleSessionShutdown`.

**Step 3 — Write minimal implementation**

In `index.ts`:

1. Delete the line `const pendingFetches = new Map<string, AbortController>();` near the top (currently line 36).
2. Delete the `function abortAllPending(): void { ... }` block (currently lines 46–51).
3. Inside `function handleSessionStart(ctx: ExtensionContext): void {` delete the `abortAllPending();` call (currently line 54).
4. Inside `function handleSessionShutdown(): void {` delete the `abortAllPending();` call (currently line 62).
5. If after deletions `generateId` is only imported but unused at module scope, leave the import — `storeResult`/`generateId` are still used by tool executors.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "index.ts has no references to pendingFetches or abortAllPending"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 6: Per-tool in-flight cancellation regression tests [depends: 1, 2, 3, 4]

Add cancellation regression tests for all four tools. `web_search`, `fetch_content`, and `code_search` drive cancellation through the same `signal` object passed to downstream async work; `get_search_content` uses the explicit already-aborted behavior added in Task 4 because it has no downstream fetch/complete call. (AC-CANCEL-7)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing tests**

Append to `index.test.ts`:

```ts
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

    const result = await promise;
    expect(getText(result)).toMatch(/abort/i);
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
```

**Step 2 — Run tests, verify they fail**
Run: `npx vitest run index.test.ts -t "per-tool in-flight cancellation"`
Expected: FAIL before Task 4 is implemented — `expect(result.isError).toBe(true)` in the `get_search_content` case receives `undefined` because the tool ignores the already-aborted signal. After Tasks 1–4 are complete this task is regression-only and should pass.

**Step 3 — Write minimal implementation**

No additional production code beyond Tasks 1–4 is required for these regression tests. Verify that:

- Task 1 forwards `signal` directly to `searchExa` / `findSimilarExa`.
- Task 2 forwards `signal` directly to `extractContent`, `extractGitHub`, and `filterContent` / `complete(...)`.
- Task 3 forwards `signal` directly to `searchContext`.
- Task 4 returns an aborted result when `get_search_content.execute` receives an already-aborted `signal`.

If any of these tests fail, fix the corresponding earlier task implementation rather than adding `AbortController`, `AbortSignal.any`, `pendingFetches`, or `abortAllPending`.

**Step 4 — Run tests, verify they pass**
Run: `npx vitest run index.test.ts -t "per-tool in-flight cancellation"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 7: handleSessionStart receives SessionStartEvent and routes by reason [depends: 5]

Replace today's `pi.on("session_start", ...)` inline branching (which only special-cases `"reload"`) with a typed handler that receives the full `SessionStartEvent` and dispatches per-reason. Add a parameterized branch test for all five reasons. (AC-LIFECYCLE-1, AC-LIFECYCLE-2, AC-LIFECYCLE-3, AC-LIFECYCLE-4, AC-LIFECYCLE-5, AC-LIFECYCLE-6, AC-LIFECYCLE-7)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Replace the existing `for (const reason of ["startup", "new", "resume", "fork"] as const)` block and the existing `reload` lifecycle test in `index.test.ts` with this parameterized test:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "routes session_start reason"`
Expected: FAIL — for `reason="reload"`, `expect(ghState.clearCloneCache).toHaveBeenCalledTimes(1)` receives 0 calls because the current inline reload branch only calls `restoreFromSession(ctx)` and returns.

**Step 3 — Write minimal implementation**

In `index.ts`, add the typed event import at the top:

```ts
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
```

Change the existing `handleSessionStart(ctx)` signature and body from:

```ts
function handleSessionStart(ctx: ExtensionContext): void {
  abortAllPending();
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  restoreFromSession(ctx);
}
```

to:

```ts
function handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void {
  switch (event.reason) {
    case "startup":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      restoreFromSession(ctx);
      return;
    case "reload":
      clearCloneCache();
      restoreFromSession(ctx);
      return;
    case "new":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      clearResults();
      return;
    case "resume":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      restoreFromSession(ctx);
      return;
    case "fork":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      restoreFromSession(ctx); // Task 10 will swap to previousSessionFile-aware restore.
      return;
  }
}
```

Replace the `pi.on("session_start", ...)` registration body with:

```ts
pi.on("session_start", async (event, ctx) => {
  handleSessionStart(event, ctx);
});
```

This removes the existing inline `if ((event as { reason?: string }).reason === "reload")` branch. The `startup` case order must remain exactly `clearCloneCache(); clearUrlCache(); cleanupTempFiles(); restoreFromSession(ctx);`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "routes session_start reason"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 8: session_start "new" reason clears the in-memory result store [depends: 7]

For `reason: "new"`, the spec requires `clearResults()` and **no** `restoreFromSession`. (AC-LIFECYCLE-4)

**Files:**
- Modify: `index.ts`
- Modify: `storage.ts` (only if `clearResults` is not already exported — it is, verified at line 81)
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t 'clears the in-memory result store and does NOT call restoreFromSession'`
Expected: FAIL before Task 7's new branch is implemented — `expect(storage.getResult("pre-new")).toBeNull()` receives the seeded stored result because the current handler calls `restoreFromSession(ctx)` instead of `clearResults()` for `reason: "new"`.

**Step 3 — Write minimal implementation**

Ensure the `case "new":` arm in `handleSessionStart` invokes `clearResults()` and skips `restoreFromSession(ctx)`:

```ts
case "new":
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  clearResults();
  return;
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t 'clears the in-memory result store and does NOT call restoreFromSession'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 9: Add restoreFromSessionFile helper that reads parent session log [depends: 5]

Add a new exported `restoreFromSessionFile(path: string)` helper in `storage.ts` that calls `loadEntriesFromFile(path)` from `@earendil-works/pi-coding-agent` and applies the same filter/restore logic as `restoreFromSession`. (Required by AC-LIFECYCLE-6.)

**Files:**
- Modify: `storage.ts`
- Modify: `storage.test.ts`

**Step 1 — Write the failing test**

Append to `storage.test.ts`:

```ts
import { vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  loadEntriesFromFile: vi.fn(() => [
    { type: "custom", customType: "web-tools-results", data: { id: "from-parent", type: "search", timestamp: Date.now(), queries: [] } },
  ]),
}));

describe("restoreFromSessionFile (#036 AC-LIFECYCLE-6)", () => {
  beforeEach(() => { clearResults(); vi.clearAllMocks(); });

  it("loads entries from the given session-file path and rehydrates the in-memory store", async () => {
    const { restoreFromSessionFile } = await import("./storage.js");
    restoreFromSessionFile("/tmp/parent.session");
    const restored = getResult("from-parent");
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe("from-parent");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run storage.test.ts -t "loads entries from the given session-file path"`
Expected: FAIL — `SyntaxError: The requested module './storage.js' does not provide an export named 'restoreFromSessionFile'`

**Step 3 — Write minimal implementation**

In `storage.ts`, add this near the bottom (after `restoreFromSession`):

```ts
import { loadEntriesFromFile } from "@earendil-works/pi-coding-agent";

export function restoreFromSessionFile(sessionFilePath: string): void {
  const now = Date.now();
  let entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
  try {
    entries = loadEntriesFromFile(sessionFilePath) as Array<{ type: string; customType?: string; data?: unknown }>;
  } catch {
    return; // missing file or parse error: leave store as-is
  }

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== "web-tools-results") continue;
    const data = entry.data as StoredResultData | undefined;
    if (!data || !data.id || !data.type) continue;
    if (data.type === "search" && !Array.isArray(data.queries)) continue;
    if (data.type === "fetch" && !Array.isArray(data.urls)) continue;
    if (data.type === "context" && (!data.context || typeof data.context.query !== "string")) continue;
    if (data.timestamp && now - data.timestamp > ONE_HOUR_MS) continue;
    store.set(data.id, data);
  }

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
```

Move the `import { loadEntriesFromFile } from "@earendil-works/pi-coding-agent";` to the top of the file with the other imports (currently `storage.ts` has no top-of-file imports — add a fresh import block at line 1).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run storage.test.ts -t "loads entries from the given session-file path"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 10: session_start "fork" branch uses event.previousSessionFile [depends: 7, 9]

Wire the `"fork"` branch of `handleSessionStart` to call `restoreFromSessionFile(event.previousSessionFile)` when set, falling back to `restoreFromSession(ctx)` otherwise. (AC-LIFECYCLE-6)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`. This test uses `vi.doMock` before importing `index.ts` so the spies are installed on the same `storage.ts` module instance that `index.ts` imports:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "calls restoreFromSessionFile(event.previousSessionFile)"`
Expected: FAIL — `expect(restoreFromSessionFileSpy).toHaveBeenCalledWith("/tmp/parent.session")` reports 0 calls because the current `"fork"` branch calls `restoreFromSession(ctx)` only.

**Step 3 — Write minimal implementation**

In `index.ts`, add `restoreFromSessionFile` to the import block:

```ts
import {
  generateId,
  storeResult,
  getResult,
  getAllResults,
  clearResults,
  restoreFromSession,
  restoreFromSessionFile,    // new
  type StoredResultData,
  type QueryResultData,
  type ExtractedContent,
  type ContextResultData,
} from "./storage.js";
```

In `handleSessionStart`, change the `case "fork":` arm to:

```ts
case "fork":
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  if (event.previousSessionFile) {
    restoreFromSessionFile(event.previousSessionFile);
  } else {
    restoreFromSession(ctx);
  }
  return;
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "calls restoreFromSessionFile(event.previousSessionFile)"` and `npx vitest run index.test.ts -t "falls back to restoreFromSession(ctx) when previousSessionFile is absent"`
Expected: both PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 11: session_start "reload" preserves URL cache and temp files [depends: 7]

The existing `reload` test (lines 231–239 in `index.test.ts`) currently asserts `clearCloneCache` is NOT called. After Task 7's switch lands, `clearCloneCache()` IS called on reload (cloned repos are session-scoped); the test must be updated. This task formalizes AC-LIFECYCLE-3 with the corrected expectations and adds an assertion that `restoreFromSession` IS called on reload.

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Replace the existing test at lines 231–239 in `index.test.ts` with:

```ts
it('session_start with reason="reload" preserves URL cache and temp files but still clears clone cache and restores results (#036 AC-LIFECYCLE-3)', async () => {
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
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t 'session_start with reason="reload"'`
Expected: FAIL before Task 7's reload branch is fixed — `expect(ghState.clearCloneCache).toHaveBeenCalled()` reports 0 calls because the current inline reload branch only calls `restoreFromSession(ctx)` and returns.

**Step 3 — Write minimal implementation**

If Task 7's switch is wrong, fix the `case "reload":` arm to be exactly:

```ts
case "reload":
  clearCloneCache();
  restoreFromSession(ctx);
  return;
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t 'session_start with reason="reload"'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 12: Adopt prepareArguments for web_search [depends: 1]

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

### Task 13: Adopt prepareArguments for fetch_content [depends: 2]

Wire `normalizeFetchContentInput` into `fetch_content.registerTool({...})` as `prepareArguments`. (AC-PREPARE-1, AC-PREPARE-2, AC-PREPARE-5.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "fetch_content ToolDefinition exposes prepareArguments"`
Expected: FAIL — `expect(typeof fetchContentTool.prepareArguments).toBe("function")` — received "undefined".

**Step 3 — Write minimal implementation**

In `index.ts`, inside `pi.registerTool({ name: "fetch_content", ... })`, add:

```ts
parameters: FetchContentParams,
prepareArguments: (raw) => normalizeFetchContentInput(raw as any) as any,
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  const { urls: dedupedUrls, forceClone, prompt, noCache } = params as any;
  // ...remainder unchanged
```

Remove the line `const { urls: dedupedUrls, forceClone, prompt, noCache } = normalizeFetchContentInput(params);` (currently line 446).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "fetch_content ToolDefinition exposes prepareArguments"` and `-t "fetch_content prepareArguments throws the documented error"` and `-t "fetch_content.execute does not re-normalize"`
Expected: all PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 14: Adopt prepareArguments for code_search [depends: 3]

Wire `normalizeCodeSearchInput` into `code_search.registerTool({...})` as `prepareArguments`. (AC-PREPARE-1, AC-PREPARE-2 for code_search.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "code_search ToolDefinition exposes prepareArguments"`
Expected: FAIL — `expect(typeof codeSearchTool.prepareArguments).toBe("function")` — received "undefined".

**Step 3 — Write minimal implementation**

In `index.ts`, inside `pi.registerTool({ name: "code_search", ... })`, add:

```ts
parameters: CodeSearchParams,
prepareArguments: (raw) => normalizeCodeSearchInput(raw as any) as any,
async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
  const { query, tokensNum } = params as any;
  // ...remainder unchanged
```

Remove the line `const { query, tokensNum } = normalizeCodeSearchInput(params);` (currently line 850).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "code_search ToolDefinition exposes prepareArguments"` etc.
Expected: all PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 15: Adopt prepareArguments for get_search_content [depends: 4]

Wire `normalizeGetSearchContentInput` into `get_search_content.registerTool({...})` as `prepareArguments`. (AC-PREPARE-1, AC-PREPARE-2 for get_search_content.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "get_search_content ToolDefinition exposes prepareArguments"`
Expected: FAIL — received "undefined".

**Step 3 — Write minimal implementation**

In `index.ts`, inside `pi.registerTool({ name: "get_search_content", ... })`, add:

```ts
parameters: GetSearchContentParams,
prepareArguments: (raw) => normalizeGetSearchContentInput(raw as any) as any,
async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
  if (signal?.aborted) {
    return {
      content: [{ type: "text" as const, text: "Operation aborted." }],
      isError: true,
    };
  }

  const { responseId, query, queryIndex, url, urlIndex, maxChars } = params as any;
  // ...remainder unchanged
}
```

Remove the line `const { responseId, query, queryIndex, url, urlIndex, maxChars } = normalizeGetSearchContentInput(params);` (currently line 980).

**Step 4 — Run tests, verify they pass**
Run: `npx vitest run index.test.ts -t "get_search_content ToolDefinition exposes prepareArguments"` etc.
Expected: all PASS

Also rerun the Task 4 cancellation test to ensure the `prepareArguments` change preserved the early abort branch:
Run: `npx vitest run index.test.ts -t "returns an aborted result when execute\\(\\) receives an already-aborted signal"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 16: Tighten WebSearchParams.numResults and prepare-function return types [depends: 12, 13, 14, 15]

Express `numResults` as `Type.Integer({ minimum: 1, maximum: 20 })` in the visible TypeBox schema, have `normalizeWebSearchInput` clamp/default it so the prepare hook produces a schema-valid integer, and add explicit return types plus focused normalization tests for all four prepare functions. (AC-PREPARE-3, AC-PREPARE-4, AC-PREPARE-6.)

**Files:**
- Modify: `index.ts`
- Modify: `tool-params.ts`
- Modify: `tool-params.test.ts`

**Step 1 — Write the failing tests**

In `tool-params.test.ts`, update the import to include `normalizeGetSearchContentInput`:

```ts
import { normalizeWebSearchInput, normalizeFetchContentInput, normalizeCodeSearchInput, normalizeGetSearchContentInput, dedupeUrls } from "./tool-params.js";
```

Append these focused prepare-function tests:

```ts
it("normalizeWebSearchInput defaults and clamps numResults for prepareArguments (AC-PREPARE-4)", () => {
  expect(normalizeWebSearchInput({ query: "q" }).numResults).toBe(5);
  expect(normalizeWebSearchInput({ query: "q", numResults: 0 }).numResults).toBe(1);
  expect(normalizeWebSearchInput({ query: "q", numResults: -5 }).numResults).toBe(1);
  expect(normalizeWebSearchInput({ query: "q", numResults: 100 }).numResults).toBe(20);
  expect(normalizeWebSearchInput({ query: "q", numResults: 7.6 }).numResults).toBe(8);
});

it("normalize prepare functions produce the post-prepare shapes consumed by execute (AC-PREPARE-3)", () => {
  expect(normalizeWebSearchInput({ query: "q" }).queries).toEqual(["q"]);
  expect(normalizeFetchContentInput({ url: "https://a" }).urls).toEqual(["https://a"]);
  expect(normalizeFetchContentInput({ urls: ["u1", "u1", "u2"] }).urls).toEqual(["u1", "u2"]);
  expect(normalizeCodeSearchInput({ query: "useState" })).toEqual({ query: "useState", tokensNum: undefined });
  expect(normalizeGetSearchContentInput({ responseId: "r1" })).toEqual({ responseId: "r1", query: undefined, queryIndex: undefined, url: undefined, urlIndex: undefined, maxChars: undefined });
});

it("normalizeWebSearchInput maps freshness and preserves documented validation errors (AC-PREPARE-6)", () => {
  expect(normalizeWebSearchInput({ query: "q", freshness: "day" }).maxAgeHours).toBe(24);
  expect(() => normalizeWebSearchInput({ query: "q", similarUrl: "https://x" })).toThrow("'similarUrl' and 'query'/'queries' are mutually exclusive.");
  expect(() => normalizeWebSearchInput({})).toThrow("Either 'query' or 'queries' must be provided.");
  expect(() => normalizeFetchContentInput({})).toThrow("Either 'url' or 'urls' must be provided.");
  expect(() => normalizeCodeSearchInput({})).toThrow("'query' must be provided.");
  expect(() => normalizeGetSearchContentInput({})).toThrow("'responseId' must be provided.");
});
```

**Step 2 — Run tests, verify they fail**
Run: `npx vitest run tool-params.test.ts -t "prepareArguments|AC-PREPARE"`
Expected: FAIL — `expect(normalizeWebSearchInput({ query: "q" }).numResults).toBe(5)` receives `undefined` because `normalizeWebSearchInput` currently leaves `numResults` undefined and the clamp/default lives inside `web_search.execute`.

**Step 3 — Write minimal implementation**

In `tool-params.ts`, add explicit return types near the top:

```ts
export type NormalizedWebSearchInput = {
  queries: string[];
  numResults: number;
  type?: "auto" | "instant" | "deep";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  detail?: "summary" | "highlights";
  maxAgeHours?: number;
  similarUrl?: string;
};

export type NormalizedFetchContentInput = {
  urls: string[];
  forceClone?: boolean;
  prompt?: string;
  noCache?: boolean;
};

export type NormalizedCodeSearchInput = {
  query: string;
  tokensNum?: number;
};

export type NormalizedGetSearchContentInput = {
  responseId: string;
  query?: string;
  queryIndex?: number;
  url?: string;
  urlIndex?: number;
  maxChars?: number;
};
```

Update the function signatures to return those types:

```ts
export function normalizeWebSearchInput(params: { /* existing param shape */ }): NormalizedWebSearchInput {
```

```ts
export function normalizeFetchContentInput(params: { url?: unknown; urls?: unknown; forceClone?: unknown; prompt?: unknown; noCache?: unknown }): NormalizedFetchContentInput {
```

```ts
export function normalizeCodeSearchInput(params: { query?: unknown; tokensNum?: unknown }): NormalizedCodeSearchInput {
```

```ts
export function normalizeGetSearchContentInput(params: { responseId?: unknown; query?: unknown; queryIndex?: unknown; url?: unknown; urlIndex?: unknown; maxChars?: unknown }): NormalizedGetSearchContentInput {
```

In `normalizeWebSearchInput`, replace the current `numResults` block:

```ts
const numResults = typeof params.numResults === "number" && Number.isFinite(params.numResults)
  ? params.numResults
  : undefined;
```

with:

```ts
let numResults: number;
if (typeof params.numResults === "number" && Number.isFinite(params.numResults)) {
  numResults = Math.max(1, Math.min(20, Math.round(params.numResults)));
} else {
  numResults = 5;
}
```

In `index.ts`, update `WebSearchParams.numResults` from optional number to a bounded integer supplied by prepareArguments:

```ts
numResults: Type.Integer({ minimum: 1, maximum: 20, description: "Results per query (default: 5, max: 20)" }),
```

Also inside the two `numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5` lines in `web_search.execute`, simplify to:

```ts
numResults,
```

**Step 4 — Run tests, verify they pass**
Run: `npx vitest run tool-params.test.ts -t "prepareArguments|AC-PREPARE"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing. Note: existing tests that pass `numResults: undefined` or omit it will now see `numResults === 5`. Update any `index.test.ts` assertions that expect `numResults: undefined` to expect `numResults: 5`.

### Task 17: Add disk-backed result-store persistence module

Create a new module that mirrors `research-cache.ts`'s read/write pattern for the session-level result store. (AC-COMPACT-1)

**Files:**
- Create: `session-results-store.ts`
- Create: `session-results-store.test.ts`

**Step 1 — Write the failing test**

Create `session-results-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resultsFilePath,
  writeStoreSnapshot,
  readStoreSnapshot,
  deleteStoreFile,
} from "./session-results-store.js";
import type { StoredResultData } from "./storage.js";

describe("session-results-store (#032 AC-COMPACT-1)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "web-tools-results-test-"));
  });

  it("resultsFilePath returns a per-session-id path under the given root", () => {
    expect(resultsFilePath("abc123", dir)).toBe(join(dir, "results-abc123.json"));
  });

  it("writeStoreSnapshot persists an array of stored results that readStoreSnapshot can load", () => {
    const sessionId = "sess-1";
    const path = resultsFilePath(sessionId, dir);
    const entries: StoredResultData[] = [
      { id: "r1", type: "search", timestamp: Date.now(), queries: [{ query: "q", answer: "a", results: [], error: null }] },
    ];
    writeStoreSnapshot(path, entries);
    expect(existsSync(path)).toBe(true);
    const loaded = readStoreSnapshot(path);
    expect(loaded).toEqual(entries);
  });

  it("readStoreSnapshot returns empty array for missing file", () => {
    expect(readStoreSnapshot(resultsFilePath("nope", dir))).toEqual([]);
  });

  it("deleteStoreFile removes the file (best-effort, no throw on missing)", () => {
    const path = resultsFilePath("sess-2", dir);
    writeStoreSnapshot(path, []);
    expect(existsSync(path)).toBe(true);
    deleteStoreFile(path);
    expect(existsSync(path)).toBe(false);
    // Second delete must not throw.
    expect(() => deleteStoreFile(path)).not.toThrow();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run session-results-store.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./session-results-store.js"`

**Step 3 — Write minimal implementation**

Create `session-results-store.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { StoredResultData } from "./storage.js";

export const DEFAULT_RESULTS_DIR = join(homedir(), ".pi", "cache", "web-tools");

export function resultsFilePath(sessionId: string, dir: string = DEFAULT_RESULTS_DIR): string {
  return join(dir, `results-${sessionId}.json`);
}

export function writeStoreSnapshot(filePath: string, entries: StoredResultData[]): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(entries), "utf-8");
  } catch {
    // best-effort
  }
}

export function readStoreSnapshot(filePath: string): StoredResultData[] {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredResultData[];
    return [];
  } catch {
    return [];
  }
}

export function deleteStoreFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // best-effort
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run session-results-store.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 18: Snapshot the result store to disk on every storeResult call site [depends: 17]

After each `storeResult(...)` + `pi.appendEntry(...)` pair in `index.ts` (three sites: `web_search`, `fetch_content`, `code_search`), also write the current store snapshot to the per-session disk file. (AC-COMPACT-2)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
import { mkdtempSync as _mkdtempCompact, rmSync as _rmSyncCompact, existsSync as _existsCompact } from "node:fs";
import { tmpdir as _tmpdirCompact } from "node:os";
import { join as _joinCompact } from "node:path";

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
```

(Note: the `ctx.webToolsResultsDir` field is a test-only override the implementation honors so we don't pollute `~/.pi/cache/web-tools/` during tests. The production code reads it as `ctx.webToolsResultsDir ?? DEFAULT_RESULTS_DIR`.)

**Step 2 — Run tests, verify they fail**
Run: `npx vitest run index.test.ts -t "writes a snapshot to results-<sessionId>.json"`
Expected: FAIL — the first failing case reports `expect(_existsCompact(_joinCompact(dir, "results-snap-web.json"))).toBe(true)` received false because no store-result call site writes `results-<sessionId>.json` yet.

**Step 3 — Write minimal implementation**

In `index.ts`, add imports:

```ts
import { writeStoreSnapshot, resultsFilePath, DEFAULT_RESULTS_DIR } from "./session-results-store.js";
import { getAllResults } from "./storage.js"; // already imported — verify
```

Define a small helper at module scope:

```ts
function snapshotStore(ctx: ExtensionContext): void {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) return;
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  writeStoreSnapshot(resultsFilePath(sessionId, dir), getAllResults());
}
```

At each of the three `storeResult(searchId, storedData); pi.appendEntry("web-tools-results", storedData);` sites (currently lines 335–336 for `web_search`, 507–508 for `fetch_content`, 880–881 for `code_search`), append a call:

```ts
storeResult(responseId, storedData);
pi.appendEntry("web-tools-results", storedData);
snapshotStore(ctx);
```

For `web_search`, `_ctx` is currently named `_ctx` — rename to `ctx` so it's used.
For `code_search`, same rename: `_ctx` -> `ctx`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "writes a snapshot to results-<sessionId>.json"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 19: Rehydrate result store from disk on session_start [depends: 7, 17, 18]

Whenever `handleSessionStart` runs a branch that "restores" (`startup`, `reload`, `resume`, `fork`), also rehydrate from `results-<sessionId>.json` before/instead of `restoreFromSession(ctx)`. The disk file is authoritative. (AC-COMPACT-3, AC-COMPACT-6)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
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
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "loads results-<sessionId>.json without reading the session log"`
Expected: FAIL — `expect(storage.getResult("from-disk")).not.toBeNull()` receives `null` because `handleSessionStart` does not read the disk snapshot yet. If a partial implementation calls `restoreFromSession(ctx)` after loading the disk snapshot, the test fails with `Error: session log should not be required when disk snapshot exists`.

**Step 3 — Write minimal implementation**

In `index.ts`, add imports:

```ts
import { readStoreSnapshot, resultsFilePath, DEFAULT_RESULTS_DIR, deleteStoreFile } from "./session-results-store.js";
import { storeResult } from "./storage.js"; // already imported — verify
```

Add a helper that returns whether a usable disk snapshot was present:

```ts
function rehydrateFromDisk(ctx: ExtensionContext): boolean {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) return false;
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  const entries = readStoreSnapshot(resultsFilePath(sessionId, dir));
  if (entries.length === 0) return false;
  clearResults();
  for (const entry of entries) {
    if (entry && entry.id && entry.type) {
      storeResult(entry.id, entry);
    }
  }
  return true;
}
```

In `handleSessionStart`, use the helper in the restore branches and only replay the session log when no disk snapshot exists. For example:

```ts
case "resume":
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  if (!rehydrateFromDisk(ctx)) restoreFromSession(ctx);
  return;
```

Apply the same pattern to `startup` and `reload`. For `fork`, preserve Task 10's parent-file behavior but do not let session-log replay overwrite an existing same-session disk snapshot:

```ts
case "fork": {
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  const restoredFromDisk = rehydrateFromDisk(ctx);
  if (!restoredFromDisk) {
    if (event.previousSessionFile) restoreFromSessionFile(event.previousSessionFile);
    else restoreFromSession(ctx);
  }
  return;
}
```

For `"new"`, do not call `rehydrateFromDisk(ctx)`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "loads results-<sessionId>.json without reading the session log"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 20: Delete the results disk file on session_shutdown [depends: 7, 17]

On `session_shutdown`, best-effort-delete the per-session results file. (First half of AC-COMPACT-4.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
describe("session_shutdown disk cleanup (#032 AC-COMPACT-4)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deletes results-<sessionId>.json on session_shutdown", async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-shutdown-"));
    const { writeStoreSnapshot, resultsFilePath } = await import("./session-results-store.js");
    const sessionId = "shutdown-sid";
    const filePath = resultsFilePath(sessionId, dir);
    writeStoreSnapshot(filePath, []);
    expect(_existsCompact(filePath)).toBe(true);

    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_shutdown");

    // Re-register a session_start first so the handler knows the current session id.
    const startHandler = handlers.get("session_start");
    await startHandler({ type: "session_start", reason: "startup" }, { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any);

    await handler({ type: "session_shutdown", reason: "quit" }, { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any);

    expect(_existsCompact(filePath)).toBe(false);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});
```

**Step 2 — Run test, verify it fails**

Note: today's `session_shutdown` handler takes **no** ctx argument (`async () => { handleSessionShutdown(); }`). The handler signature must change to accept `(event, ctx)` and forward `ctx` so `getSessionId()` works.

Run: `npx vitest run index.test.ts -t "deletes results-<sessionId>.json on session_shutdown"`
Expected: FAIL — `expect(_existsCompact(filePath)).toBe(false)` — received true.

**Step 3 — Write minimal implementation**

In `index.ts`, change:

```ts
pi.on("session_shutdown", async () => {
  handleSessionShutdown();
});
```

to:

```ts
pi.on("session_shutdown", async (_event, ctx) => {
  handleSessionShutdown(ctx);
});
```

And change `function handleSessionShutdown(): void {` to `function handleSessionShutdown(ctx: ExtensionContext): void {` and add at the top of its body:

```ts
const sessionId = ctx.sessionManager.getSessionId();
if (sessionId) {
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  deleteStoreFile(resultsFilePath(sessionId, dir));
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "deletes results-<sessionId>.json on session_shutdown"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 21: Prune stale results disk files (&gt;24h) on session_start [depends: 19]

Add a `pruneStaleStoreFiles(dir, maxAgeMs)` helper and call it from every `session_start` arm. (Second half of AC-COMPACT-4.)

**Files:**
- Modify: `session-results-store.ts`
- Modify: `session-results-store.test.ts`
- Modify: `index.ts`

**Step 1 — Write the failing test**

Append to `session-results-store.test.ts`:

```ts
import { readdirSync, utimesSync } from "node:fs";

it("pruneStaleStoreFiles deletes files older than maxAgeMs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "web-tools-prune-"));
  const { writeStoreSnapshot, pruneStaleStoreFiles, resultsFilePath } = await import("./session-results-store.js");
  const oldPath = resultsFilePath("old", dir);
  const newPath = resultsFilePath("new", dir);
  writeStoreSnapshot(oldPath, []);
  writeStoreSnapshot(newPath, []);

  // Backdate the "old" file 2 days.
  const past = Date.now() / 1000 - 60 * 60 * 48;
  utimesSync(oldPath, past, past);

  pruneStaleStoreFiles(dir, 24 * 60 * 60 * 1000);

  const remaining = readdirSync(dir);
  expect(remaining).not.toContain("results-old.json");
  expect(remaining).toContain("results-new.json");

  rmSync(dir, { recursive: true, force: true });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run session-results-store.test.ts -t "pruneStaleStoreFiles deletes files older than maxAgeMs"`
Expected: FAIL — `Error: ... pruneStaleStoreFiles is not exported`

**Step 3 — Write minimal implementation**

In `session-results-store.ts`, add:

```ts
import { readdirSync, statSync } from "node:fs";

export function pruneStaleStoreFiles(dir: string, maxAgeMs: number): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith("results-") || !name.endsWith(".json")) continue;
    const full = join(dir, name);
    try {
      const stat = statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        deleteStoreFile(full);
      }
    } catch {
      // ignore
    }
  }
}
```

In `index.ts`, inside `handleSessionStart`, add at the very top (before the switch):

```ts
const initialDir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
pruneStaleStoreFiles(initialDir, 24 * 60 * 60 * 1000);
```

And add `pruneStaleStoreFiles` to the existing import from `./session-results-store.js`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run session-results-store.test.ts -t "pruneStaleStoreFiles deletes files older than maxAgeMs"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 22: Compaction regression test: get_search_content resolves pre-compaction responseId [depends: 18, 19]

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

### Task 23: Bump package.json version to 4.1.0 [no-test] [depends: 22]

Bump the published version. (AC-BATCH-2) [no-test]

**Justification:** Version bump is metadata; no observable behavior change beyond what npm publish surfaces. The other ACs are validated by their own tests.

**Files:**
- Modify: `package.json`

**Step 1 — Make the change**

In `package.json`, change `"version": "4.0.0"` to `"version": "4.1.0"`.

**Step 2 — Verify**
Run: `node -p "require('./package.json').version"`
Expected: `4.1.0`

### Task 24: Add 4.1.0 changelog section to README [no-test] [depends: 23]

Document the modernization. (AC-BATCH-3) [no-test]

**Justification:** Documentation-only change.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**

Add a `## 4.1.0` section near the top of the changelog area in `README.md` (above the existing `## 4.0.0` section if one exists; otherwise above the first `## ` heading after the intro). Content:

```markdown
## 4.1.0

- **pi-native cancellation**: tool executors now forward the per-call `signal` directly to Exa/extract/filter calls; the manual `pendingFetches` Map and `abortAllPending` helper are gone (~30 lines removed per tool).
- **Smarter `session_start` lifecycle**: branch on `event.reason` — `reload` preserves the URL cache and temp files, `new` starts clean, `fork` restores from `event.previousSessionFile` via the new `restoreFromSessionFile` helper.
- **`prepareArguments` adoption**: all four tools (`web_search`, `fetch_content`, `code_search`, `get_search_content`) wire their `normalize*Input` functions into pi's `ToolDefinition.prepareArguments` hook. `numResults` is now a bounded integer in the visible schema.
- **Compaction-safe result store**: `get_search_content` no longer fails after `/compact`. The session result store is mirrored to `~/.pi/cache/web-tools/results-<sessionId>.json` and rehydrated on `session_start`. Files older than 24h are pruned automatically.
```

**Step 2 — Verify**
Run: `grep -n "## 4.1.0" README.md`
Expected: at least one line printed.

### Task 25: Assert index.ts shrank vs the v4.0.0 baseline [depends: 5, 22]

Add a meta-test asserting that the final `index.ts` line count is strictly less than 1192 (its v4.0.0 line count as confirmed by `wc -l index.ts` at brainstorm time), and perform final batch verification with no newly skipped tests. (AC-BATCH-1, AC-BATCH-4)

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
import { readFileSync as _readFileLineCheck } from "node:fs";

describe("index.ts shrinkage (#040 AC-BATCH-4)", () => {
  it("index.ts is strictly shorter than the v4.0.0 baseline of 1192 lines", () => {
    const src = _readFileLineCheck("index.ts", "utf-8");
    const lineCount = src.endsWith("\n") ? src.split("\n").length - 1 : src.split("\n").length;
    expect(lineCount).toBeLessThan(1192);
  });
});
```

**Step 2 — Run test, verify it fails**

If the batch's earlier tasks landed correctly, line count should already be well below 1192 (Task 5 alone removed ~25 lines via `pendingFetches`/`abortAllPending`/per-tool wrappers). If FAIL, message will be `expect(lineCount).toBeLessThan(1192)` — received e.g. 1210.

Run: `npx vitest run index.test.ts -t "index.ts is strictly shorter than the v4.0.0 baseline"`
Expected after tasks 1–22: PASS.

**Step 3 — Write minimal implementation**

If failing despite earlier tasks, hunt for residual dead code: leftover empty `try { ... }` blocks from removed `pendingFetches` plumbing, unused imports, dead `combinedSignal` references. None expected.

**Step 4 — Run test, verify it passes**
Run: same command.
Expected: PASS

**Step 5 — Verify no regressions (AC-BATCH-1)**
Run: `npm test`
Expected: exit code 0; no new `.skip`/`.only` markers were introduced for tests that were previously enabled.
