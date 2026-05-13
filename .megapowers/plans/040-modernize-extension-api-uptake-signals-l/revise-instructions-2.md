## Task 6: Per-tool in-flight cancellation regression tests

The `code_search` cancellation assertion is wrong for the real `index.ts` implementation. `code_search.execute` catches errors from `searchContext(...)` and returns a tool result with `isError: true`; it does **not** reject. The current task says:

```ts
await expect(resultPromise).rejects.toThrow(/abort/i);
```

Replace it with the same return-result style used by the other tools:

```ts
const result = await codeSearchTool.execute(
  "call-code-abort",
  { query: "useState", tokensNum: undefined },
  controller.signal,
  undefined,
  { sessionManager: { getEntries: () => [], getSessionId: () => "s1" } } as any,
);
queueMicrotask(() => controller.abort());

expect(result.isError).toBe(true);
expect(getText(result)).toMatch(/abort/i);
```

Because the abort must occur after `searchContext` installs its listener, preserve the promise pattern but assert on the resolved result:

```ts
const resultPromise = codeSearchTool.execute(/* same args */);
queueMicrotask(() => controller.abort());
const result = await resultPromise;
expect(result.isError).toBe(true);
expect(getText(result)).toMatch(/abort/i);
```

Also fix Step 2. It currently says the whole task may already be green after Tasks 1–4, which is not a valid RED expectation for a non-`[no-test]` task. Make Step 2 specific to the current bad state, for example:

```md
Expected: FAIL before Task 4 is implemented — `expect(result.isError).toBe(true)` in the `get_search_content` case receives `undefined` because the tool ignores the already-aborted signal. After Tasks 1–4 are complete this task is regression-only and should pass.
```

## Task 7: handleSessionStart receives SessionStartEvent and routes by reason

The parameterized test still does not satisfy AC-LIFECYCLE-7 as written. AC-LIFECYCLE-7 requires the test to assert via spies/mocks which of `clearResults`, `restoreFromSession`, and `restoreFromSessionFile` were called or skipped. The current test only infers restore through `getEntries` and only infers clearResults through store contents.

Use the same `vi.doMock("./storage.js", ...)` pattern as Task 10 so `index.ts` imports the spied functions. Replace the parameterized test helper with a local registration helper like:

```ts
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
```

Then each parameterized case must assert the spies explicitly:

```ts
if (shouldClearResults) expect(clearResultsSpy).toHaveBeenCalledTimes(1);
else expect(clearResultsSpy).not.toHaveBeenCalled();

if (restore) expect(restoreFromSessionSpy).toHaveBeenCalledWith(ctx);
else expect(restoreFromSessionSpy).not.toHaveBeenCalled();
expect(restoreFromSessionFileSpy).not.toHaveBeenCalled();
```

For the `fork`/`previousSessionFile` requirement, either include a separate case in Task 7 or point Task 7 to Task 10, but AC-LIFECYCLE-7 must be explicitly satisfied in one of those tests. If Task 7 owns it, add:

```ts
await handler({ type: "session_start", reason: "fork", previousSessionFile: "/tmp/parent.session" }, ctx as any);
expect(restoreFromSessionFileSpy).toHaveBeenCalledWith("/tmp/parent.session");
expect(restoreFromSessionSpy).not.toHaveBeenCalled();
```

## Task 15: Adopt prepareArguments for get_search_content

Task 4 now renames the third execute parameter to `signal` and adds an early abort check. Task 15 still tells the implementer to use `_signal`:

```ts
async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
  const { responseId, query, queryIndex, url, urlIndex, maxChars } = params as any;
```

That would accidentally erase Task 4's cancellation behavior. Revise Task 15 Step 3 so it preserves the signal parameter and early abort check while removing only the in-body normalization:

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
  // existing body continues unchanged
}
```

Also add a sentence to Step 4 saying the Task 4 cancellation test must still pass after Task 15:

```md
Run: `npx vitest run index.test.ts -t "returns an aborted result when execute\\(\\) receives an already-aborted signal"`
Expected: PASS
```

## Task 19: Rehydrate result store from disk on session_start

The Step 1 test snippet has a syntax error: it closes the `it(...)` block but not the surrounding `describe(...)` block. The current snippet ends with only:

```ts
    _rmSyncCompact(dir, { recursive: true, force: true });
});
```

It must be:

```ts
    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});
```

Without this, the test file will not parse.

Also add Task 18 as an explicit dependency. Task 19 imports `DEFAULT_RESULTS_DIR` / `resultsFilePath` from `session-results-store.ts` (Task 17), but it is ordered after and semantically builds on Task 18's `webToolsResultsDir` convention and snapshot helper behavior. The frontmatter should be:

```yaml
depends_on:
  - 7
  - 17
  - 18
```

## Task 22: Compaction regression test: get_search_content resolves pre-compaction responseId

The revised compaction test is close, but the code snippet has a misleading step comment and no assertion that compaction actually rehydrated from disk after clearing memory. After:

```ts
storage.clearResults();
await compact({ type: "session_compact" }, ctx);
```

add an explicit assertion before calling `get_search_content`:

```ts
expect(storage.getResult(responseId)).not.toBeNull();
```

This proves the `session_compact` handler restored the disk-backed store, rather than `get_search_content` succeeding for some unrelated reason.

Also fix the comment numbering so it remains self-contained:

```ts
// 4. get_search_content must now resolve the pre-compaction responseId.
```

Finally, make Step 3 robust by stating that `snapshotStore(ctx)` and `rehydrateFromDisk(ctx)` must be module-scope helpers available before registering handlers. The implementation text should say:

```md
These handlers must be registered after the helpers are declared/imported and before tests inspect `handlers.get("session_before_compact")` / `handlers.get("session_compact")`.
```
