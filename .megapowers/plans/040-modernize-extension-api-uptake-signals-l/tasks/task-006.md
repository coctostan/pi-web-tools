---
id: 6
title: Per-tool in-flight cancellation regression tests
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

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
