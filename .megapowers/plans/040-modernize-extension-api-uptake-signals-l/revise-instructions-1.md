## Task 2: fetch_content: forward execute()'s signal directly to extractors

Step 3 is incomplete for AC-CANCEL-2. The real `filterContent` signature in `filter.ts` is:

```ts
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn
): Promise<FilterResult>
```

and `filterContent` calls `completeFn(model, context, { apiKey, headers })` without a `signal`. AC-CANCEL-2 explicitly requires the pi-provided `signal` to reach `filterContent` and any `complete(...)` calls. Revise this task to change `filter.ts` too:

```ts
type CompleteFn = (model: Model<Api>, context: Context, options?: ProviderStreamOptions) => Promise<AssistantMessage>;

export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn,
  signal?: AbortSignal
): Promise<FilterResult> {
  // ...
  const response = await completeFn(model, context, { apiKey, headers, signal });
}
```

Then update both `filterContent(...)` call sites in `fetch_content.execute` to pass the same `signal` argument:

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

Add a failing test that uses `prompt` and asserts the mocked `filterContent` receives `externalSignal` as its sixth argument:

```ts
expect(state.filterContent.mock.calls[0][5]).toBe(externalSignal);
```

Keep the existing extractor signal identity test, but it is not enough by itself.

## Task 4: get_search_content: drop unused signal-wrapping plumbing

This is not a valid TDD task as written: Step 2 says the test may already pass and Step 3 says no code change is expected. Also AC-CANCEL-7 requires a cancellation test per tool, but this task only checks source text and does not drive an aborted `signal` through `execute(...)`.

Rewrite the task so it is either clearly marked `[no-test]` with a concrete justification for why `get_search_content` has no downstream fetch/complete call, or add a real behavioral cancellation regression. If you keep it as a tested task, make the test drive an already-aborted signal through `get_search_content.execute(...)` using a stored result and assert the tool still has no manual cancellation plumbing and does not reference `pendingFetches`/`abortAllPending`. Do not claim it satisfies the “rejects/returns aborted result” part unless the implementation is changed to observe aborted signals.

At minimum, the task must explicitly document the AC-CANCEL-7 exception for `get_search_content`, because the current code only reads `getResult(...)` from `storage.ts` and has no fetch/complete call to abort.

## Task 6: In-flight cancellation regression test for fetch_content

AC-CANCEL-7 says `index.test.ts` must contain at least one cancellation test **per tool**. This task only covers `fetch_content` and calls it a “representative case,” which leaves `web_search`, `code_search`, and `get_search_content` uncovered.

Split or expand the cancellation test coverage:

- Add a `web_search` cancellation test where `exaState.searchExa` rejects when the passed signal aborts, then abort the controller and assert the tool surfaces an aborted result/error.
- Add a `code_search` cancellation test where `exaContextState.searchContext` rejects when the passed `options.signal` aborts, then assert the tool returns/rejects with an abort indication.
- Address `get_search_content` explicitly as described in Task 4.

Also fix Step 2: before Task 2, `AbortSignal.any([externalSignal, abortController.signal])` will still abort when `externalSignal` aborts, so the proposed `fetch_content` test is likely to pass before the production change. The expected RED must be tied to direct signal forwarding (identity) or to behavior that actually fails before the implementation.

## Task 7: handleSessionStart receives SessionStartEvent and routes by reason

The current task does not satisfy AC-LIFECYCLE-7. It adds one no-op test that only asserts the handler does not throw for a `fork` event. Replace it with a parameterized branch test covering all five reasons (`startup`, `reload`, `new`, `resume`, `fork`) and asserting which calls happen or are skipped.

Use observable spies/mocks for these exact functions:

- `clearCloneCache`
- `clearUrlCache`
- `cleanupTempFiles`
- `clearResults`
- `restoreFromSession`
- `restoreFromSessionFile` once Task 9 exists, or leave fork-file assertions to Task 10 but still cover the fallback branch here

Expected branch table:

```ts
const cases = [
  { reason: "startup", clearUrl: true, cleanup: true, clearResults: false, restore: true },
  { reason: "reload",  clearUrl: false, cleanup: false, clearResults: false, restore: true },
  { reason: "new",     clearUrl: true, cleanup: true, clearResults: true, restore: false },
  { reason: "resume",  clearUrl: true, cleanup: true, clearResults: false, restore: true },
  { reason: "fork",    clearUrl: true, cleanup: true, clearResults: false, restore: true },
] as const;
```

Do not use `expect(true).toBe(true)`. Each branch must assert positive and negative calls. Also keep the implementation switch order for `startup`: `clearCloneCache(); clearUrlCache(); cleanupTempFiles(); restoreFromSession(ctx);`.

## Task 8: session_start "new" reason clears the in-memory result store

The proposed test is a false positive because it seeds `./storage.js`, then calls `getSessionHandlers()`, and `getSessionHandlers()` calls `vi.resetModules()`. That means the handler uses a fresh `storage.ts` module instance, not the one seeded by the test.

Seed the store **after** registering/importing the extension so the test and `index.ts` share the same `storage.ts` module instance:

```ts
const handlers = await getSessionHandlers();
const handler = handlers.get("session_start");
const storage = await import("./storage.js");
storage.storeResult("pre-new", { id: "pre-new", type: "search", timestamp: Date.now(), queries: [] });
expect(storage.getResult("pre-new")).not.toBeNull();

const getEntries = vi.fn(() => [/* would restore if called */]);
await handler({ type: "session_start", reason: "new" }, { sessionManager: { getEntries, getSessionId: () => "new-sid" } } as any);

expect(storage.getResult("pre-new")).toBeNull();
expect(getEntries).not.toHaveBeenCalled();
```

## Task 10: session_start "fork" branch uses event.previousSessionFile

The proposed `vi.spyOn(storage, ...)` assertions will not observe calls from `index.ts` because the test imports `./storage.js`, installs spies, and then calls `getSessionHandlers()`, whose first action is `vi.resetModules()`. That reloads `index.ts` and `storage.ts`, discarding the spied module instance.

Use one of these patterns instead:

1. Add a local helper in the test that does **not** call `vi.resetModules()` after the spies are installed, then imports `./index.js`; or
2. Use `vi.doMock("./storage.js", async importOriginal => ({ ...(await importOriginal()), restoreFromSession: vi.fn(), restoreFromSessionFile: vi.fn() }))` before importing `./index.js`.

The revised test must prove the same module instance is used and assert:

```ts
expect(restoreFromSessionFileSpy).toHaveBeenCalledWith("/tmp/parent.session");
expect(restoreFromSessionSpy).not.toHaveBeenCalled();
```

and for the fallback:

```ts
expect(restoreFromSessionFileSpy).not.toHaveBeenCalled();
expect(restoreFromSessionSpy).toHaveBeenCalledWith(ctx);
```

## Task 11: session_start "reload" preserves URL cache and temp files

This task has the same `vi.spyOn(storage, "restoreFromSession")` / `vi.resetModules()` bug as Task 10. Install the spy on the same `storage.ts` module instance that `index.ts` imports, or assert `ctx.sessionManager.getEntries` was called instead of spying on a discarded module instance.

A simpler reliable assertion is:

```ts
const getEntries = vi.fn(() => []);
const ctx = { sessionManager: { getEntries, getSessionId: () => "reload-sid" } };
await handler({ type: "session_start", reason: "reload" }, ctx as any);

expect(state.clearUrlCache).not.toHaveBeenCalled();
expect(offloadState.cleanupTempFiles).not.toHaveBeenCalled();
expect(ghState.clearCloneCache).toHaveBeenCalled();
expect(getEntries).toHaveBeenCalled();
```

## Task 16: Tighten WebSearchParams.numResults to a bounded integer

This task only covers AC-PREPARE-4. The plan is missing AC-PREPARE-3 and AC-PREPARE-6 entirely.

Add a follow-up task or expand this task to cover `tool-params.ts` prepare-function return types and focused normalization tests. The tests must import all four normalize functions, including `normalizeGetSearchContentInput`, and cover at minimum:

```ts
expect(normalizeWebSearchInput({ query: "q" }).queries).toEqual(["q"]);
expect(normalizeFetchContentInput({ url: "https://a" }).urls).toEqual(["https://a"]);
expect(normalizeFetchContentInput({ urls: ["u1", "u1", "u2"] }).urls).toEqual(["u1", "u2"]);
expect(normalizeWebSearchInput({ query: "q", freshness: "day" }).maxAgeHours).toBe(24);
expect(() => normalizeWebSearchInput({ query: "q", similarUrl: "https://x" })).toThrow("'similarUrl' and 'query'/'queries' are mutually exclusive.");
expect(() => normalizeWebSearchInput({})).toThrow("Either 'query' or 'queries' must be provided.");
expect(() => normalizeFetchContentInput({})).toThrow("Either 'url' or 'urls' must be provided.");
expect(() => normalizeCodeSearchInput({})).toThrow("'query' must be provided.");
expect(() => normalizeGetSearchContentInput({})).toThrow("'responseId' must be provided.");
```

Also update the TypeScript return types so the normalize functions return the shapes consumed after `prepareArguments` (for example, make `normalizeWebSearchInput` return an object where `numResults` is a required bounded integer after Task 16).

## Task 18: Snapshot the result store to disk on every storeResult call site

The implementation text says to update all three `storeResult(...)` + `pi.appendEntry(...)` sites, but the test only covers `web_search`. Add tests for the other observable call sites or explicitly split them:

- `fetch_content` writes `results-<sessionId>.json` after storing a fetch result.
- `code_search` writes `results-<sessionId>.json` after storing a context result.

This matters because AC-COMPACT-2 says **every** `storeResult(...)` invocation that appends an entry must also write the current snapshot.

## Task 19: Rehydrate result store from disk on session_start

The implementation does not make the disk file authoritative enough for AC-COMPACT-3/6. It calls `rehydrateFromDisk(ctx)` and then still calls `restoreFromSession(ctx)`, but the test uses `getEntries: () => []`, so it does not prove rehydration works “without relying on `ctx.sessionManager.getEntries()`.”

Revise the test so `getEntries` throws when a matching disk file exists:

```ts
const getEntries = vi.fn(() => { throw new Error("session log should not be required when disk snapshot exists"); });
const ctx = { sessionManager: { getEntries, getSessionId: () => sessionId }, webToolsResultsDir: dir };
await handler({ type: "session_start", reason: "resume" }, ctx as any);
expect(storage.getResult("from-disk")).not.toBeNull();
expect(getEntries).not.toHaveBeenCalled();
```

Then implement a helper that returns whether a disk snapshot was present:

```ts
function rehydrateFromDisk(ctx: ExtensionContext): boolean {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) return false;
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  const entries = readStoreSnapshot(resultsFilePath(sessionId, dir));
  if (entries.length === 0) return false;
  clearResults();
  for (const entry of entries) storeResult(entry.id, entry);
  return true;
}
```

In restore branches, call `restoreFromSession(ctx)` only when `rehydrateFromDisk(ctx)` returns `false`. For `fork` with `event.previousSessionFile`, preserve the AC-LIFECYCLE-6 behavior, but do not let session-log replay overwrite an existing same-session disk snapshot.

## Task 20: Delete the results disk file on session_shutdown

Add the missing dependency annotation on the session lifecycle refactor. This task changes the `session_shutdown` handler signature and relies on the event-registration shape introduced in Task 7, so its frontmatter should include:

```yaml
depends_on:
  - 7
  - 17
```

Keeping the numeric order is not enough; the plan review requires dependency annotations to be correct.

## Task 22: Compaction regression test: get_search_content resolves pre-compaction responseId

The proposed regression test does not meet AC-COMPACT-5 because it never emits `session_before_compact` or `session_compact`. It manually clears storage and calls `session_start`. Revise the test to simulate the required event sequence:

```ts
const beforeCompact = handlers.get("session_before_compact");
const compact = handlers.get("session_compact");
expect(beforeCompact).toBeDefined();
expect(compact).toBeDefined();

await beforeCompact({ type: "session_before_compact" }, ctx);

// Simulate appendEntry records becoming unreachable after compaction.
storage.clearResults();
await compact({ type: "session_compact" }, ctx);
```

If the implementation chooses not to register compaction handlers because disk snapshots are written at `storeResult(...)` time, then the test still must emit the events and assert they do not break restoration. Either register no-op/best-effort handlers or adjust the test to explicitly verify the handlers' absence is intentional while still performing the `session_before_compact`/`session_compact` simulation described by AC-COMPACT-5. The current test is only a session-start rehydrate test and duplicates Task 19.

## Task 23: Bump package.json version to 4.1.0

This no-test task is acceptable, but AC-BATCH-1 is not referenced anywhere in the plan. Add AC-BATCH-1 to a final verification task (or this task’s verification notes if you keep the final suite there) so the coverage check finds it. The plan must explicitly state that `npm test` exits 0 with no newly skipped tests.

## Task 25: Assert index.ts shrank vs the v4.0.0 baseline

This task can cover AC-BATCH-1 as the final verification task if revised. Add the AC-BATCH-1 identifier to its description and Step 5, and make Step 5 explicitly say:

```md
Run: `npm test`
Expected: exit code 0; no new `.skip`/`.only` markers were introduced for tests that were previously enabled.
```

Also prefer counting newlines in a way that matches `wc -l`:

```ts
const lineCount = src.endsWith("\n") ? src.split("\n").length - 1 : src.split("\n").length;
expect(lineCount).toBeLessThan(1192);
```
