---
id: 1
title: "web_search: forward execute()'s signal directly to Exa calls"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

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
