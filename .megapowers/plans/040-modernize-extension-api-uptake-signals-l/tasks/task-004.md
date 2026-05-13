---
id: 4
title: "get_search_content: drop unused signal-wrapping plumbing"
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

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
