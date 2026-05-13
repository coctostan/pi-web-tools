# Verify — 040-modernize-extension-api-uptake-signals-l

## Test Suite Results

Project convention check: no `AGENTS.md` found. Test/build commands inferred from `package.json` scripts: `npm test` and `npm run build`.

Fresh full test command:

```bash
npm test
```

Output:

```text
> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ scope-rescope.test.ts (3 tests) 9ms
 ✓ github-extract.clone.test.ts (4 tests) 34ms
 ✓ exa-context.test.ts (9 tests) 7ms
 ✓ session-results-store.test.ts (5 tests) 6ms
 ✓ retry.test.ts (14 tests) 16ms
 ✓ config.test.ts (18 tests) 17ms
 ✓ exa-search.test.ts (36 tests) 13ms
 ✓ research-cache.test.ts (14 tests) 12ms
 ✓ offload.test.ts (9 tests) 11ms
 ✓ github-extract.test.ts (9 tests) 2ms
 ✓ filter.test.ts (12 tests) 3ms
 ✓ tool-params.test.ts (41 tests) 5ms
 ✓ storage.test.ts (8 tests) 8ms
 ✓ smart-search.test.ts (11 tests) 5ms
 ✓ smart-search.integration.test.ts (1 test) 400ms
 ✓ truncation.test.ts (7 tests) 3ms
 ✓ cli.code.test.ts (2 tests) 4ms
 ✓ cli.search.test.ts (2 tests) 3ms
 ✓ extract.test.ts (17 tests) 150ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 2ms
 ✓ cli.fetch.raw.test.ts (2 tests) 19ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 4ms
 ✓ cli.usage.test.ts (2 tests) 2ms
 ✓ ptc-value.test.ts (16 tests) 925ms
 ✓ index.test.ts (66 tests) 1055ms

 Test Files  25 passed (25)
      Tests  311 passed (311)
   Duration  1.43s
```

Fresh build command:

```bash
npm run build
```

Output:

```text
✓ Build successful (0 units compiled)
```

Skip check:

```text
grep literal '.skip' in *.test.ts: [0 matches in 0 files]
```

Impact check on primary changed lifecycle/store symbols:

```text
impact(["handleSessionStart", "snapshotStore", "rehydrateFromDisk"], behavior_change):
No dependents found for 'handleSessionStart' within depth 3.
No dependents found for 'snapshotStore' within depth 3.
No dependents found for 'rehydrateFromDisk' within depth 3.
```

Trace from lifecycle entry point:

```text
trace(handleSessionStart):
mode: static (heuristic, no runtime evidence)
index.ts  69:366  handleSessionStart  function [untested]
extract.ts  clearUrlCache
github-extract.ts  clearCloneCache
index.ts  rehydrateFromDisk
session-results-store.ts  resultsFilePath/readStoreSnapshot/pruneStaleStoreFiles/deleteStoreFile
storage.ts  storeResult/clearResults/restoreFromSession/restoreFromSessionFile
offload.ts  cleanupTempFiles
```

Symbol card for lifecycle handler:

```text
handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void
index.ts 69-110
Callees include pruneStaleStoreFiles, clearResults, clearCloneCache, clearUrlCache, cleanupTempFiles, restoreFromSession, restoreFromSessionFile.
Source branches on event.reason for startup/reload/new/resume/fork.
```

## Bug/Symptom Reproduction

Original symptom: after `/compact`, pre-compaction `responseId`s could become unreachable and `get_search_content` returned `No result found for responseId ...`.

Fresh focused regression command:

```bash
npx vitest run index.test.ts -t "compaction-safe state"
```

Output:

```text
 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ index.test.ts (66 tests | 65 skipped) 507ms
   ✓ compaction-safe state (#032 AC-COMPACT-5) > get_search_content resolves a pre-compaction responseId via disk-backed store  506ms

 Test Files  1 passed (1)
      Tests  1 passed | 65 skipped (66)
```

The regression drives `web_search`, emits `session_before_compact`, clears the in-memory store, emits `session_compact`, and then successfully resolves the old `responseId` through `get_search_content`.

## Per-Criterion Verification

### Criterion 1: AC-CANCEL-1
**Evidence:** `index.ts:192-193` defines `web_search.execute(..., signal, ...)`; `findSimilarExa` receives `signal` at `index.ts:209-216`; `searchExa` receives `signal` at `index.ts:265-275`. Fresh grep for `pendingFetches|abortAllPending|new AbortController|AbortSignal\.any` in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 2: AC-CANCEL-2
**Evidence:** `fetch_content.execute(..., signal, ...)` is at `index.ts:445-446`; `extractGitHub(targetUrl, signal, forceClone)` is at `index.ts:456`; `extractContent(targetUrl, signal)` is at `index.ts:463`; `filterContent(..., complete, signal)` is at `index.ts:520-527` and `index.ts:671-678`. `filter.ts:87-117` accepts `signal?: AbortSignal` and passes `{ apiKey, headers, signal }` to `completeFn`. There are no `fetchAllContent` calls in `index.ts`. Forbidden cancellation grep in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 3: AC-CANCEL-3
**Evidence:** `code_search.execute(..., signal, ...)` is at `index.ts:847-848`; `searchContext(query, { ..., signal })` is at `index.ts:853-857`. Forbidden cancellation grep in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 4: AC-CANCEL-4
**Evidence:** `get_search_content.execute(..., signal, ...)` is at `index.ts:970`; because there are no downstream fetch/complete calls, it observes an already-aborted signal and returns an aborted error at `index.ts:971-977`. Forbidden cancellation grep in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 5: AC-CANCEL-5
**Evidence:** Fresh grep for `pendingFetches|abortAllPending|new AbortController|AbortSignal\.any` in `index.ts` returned `[0 matches in 0 files]`. The module-scope area and handlers contain no `pendingFetches` Map or `abortAllPending` helper.
**Verdict:** pass.

### Criterion 6: AC-CANCEL-6
**Evidence:** `handleSessionStart` at `index.ts:69-110` and `handleSessionShutdown` at `index.ts:112-122` contain no `abortAllPending`; the same fresh forbidden grep over `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 7: AC-CANCEL-7
**Evidence:** `index.test.ts:1461-1558` contains per-tool cancellation tests: web_search at `1464`, fetch_content at `1492`, code_search at `1520`, get_search_content at `1549`. Fresh grep for `pendingFetches|abortAllPending` in `index.test.ts` returned `[0 matches in 0 files]`. Full suite includes `index.test.ts (66 tests)` and passes.
**Verdict:** pass.

### Criterion 8: AC-LIFECYCLE-1
**Evidence:** `index.ts:1` imports `SessionStartEvent`; `handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext)` is at `index.ts:69`; registration `pi.on("session_start", async (event, ctx) => { handleSessionStart(event, ctx); })` is at `index.ts:139-141`.
**Verdict:** pass.

### Criterion 9: AC-LIFECYCLE-2
**Evidence:** Startup branch at `index.ts:73-78` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, then restores via `rehydrateFromDisk(ctx)` or `restoreFromSession(ctx)` when no disk snapshot exists. Parameterized test in `index.test.ts:270-326` includes startup with `clearUrl: true`, `cleanup: true`, `restore: true`.
**Verdict:** pass.

### Criterion 10: AC-LIFECYCLE-3
**Evidence:** Reload branch at `index.ts:79-82` calls `clearCloneCache()` and restore, and does not call `clearUrlCache()` or `cleanupTempFiles()`. Parameterized test in `index.test.ts:270-326` includes reload with `clearUrl: false`, `cleanup: false`, `restore: true`.
**Verdict:** pass.

### Criterion 11: AC-LIFECYCLE-4
**Evidence:** New branch at `index.ts:83-88` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, and `clearResults()`, then returns without restore. Dedicated test at `index.test.ts:1585-1603` verifies seeded memory is cleared and `getEntries` is not called.
**Verdict:** pass.

### Criterion 12: AC-LIFECYCLE-5
**Evidence:** Resume branch at `index.ts:89-94` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, then restores via disk or `restoreFromSession(ctx)`. Parameterized lifecycle test in `index.test.ts:270-326` includes resume with cleanup and restore expected.
**Verdict:** pass.

### Criterion 13: AC-LIFECYCLE-6
**Evidence:** Fork branch at `index.ts:95-107` calls clone/url/temp cleanup, tries disk restore, then calls `restoreFromSessionFile(event.previousSessionFile)` when present or `restoreFromSession(ctx)` when absent. `storage.ts:1` imports `loadEntriesFromFile`; `storage.ts:115-140` implements `restoreFromSessionFile`. Tests at `index.test.ts:398-412` assert the previous session file path and fallback behavior.
**Verdict:** pass.

### Criterion 14: AC-LIFECYCLE-7
**Evidence:** Parameterized test at `index.test.ts:270-326` covers `startup`, `reload`, `new`, `resume`, and `fork`, asserting clear/cleanup/restore behavior. Fork previous-file assertion is at `index.test.ts:398-405` with `/tmp/parent.session`.
**Verdict:** pass.

### Criterion 15: AC-PREPARE-1
**Evidence:** AST search for `pi.registerTool({ ..., prepareArguments: (raw) => normalize*Input(raw as any) as any, ... })` found all four tool registrations. Specific lines: web_search `index.ts:190`, fetch_content `index.ts:443`, code_search `index.ts:845`, get_search_content `index.ts:968`.
**Verdict:** pass.

### Criterion 16: AC-PREPARE-2
**Evidence:** Executors destructure already-normalized `params` directly at `index.ts:193`, `446`, `848`, and `978`. Grep for `normalizeWebSearchInput(params|normalizeFetchContentInput(params|normalizeCodeSearchInput(params|normalizeGetSearchContentInput(params` in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 17: AC-PREPARE-3
**Evidence:** `tool-params.ts:13-44` defines `NormalizedWebSearchInput`, `NormalizedFetchContentInput`, `NormalizedCodeSearchInput`, and `NormalizedGetSearchContentInput`; the corresponding functions return those types at `tool-params.ts:46-167`. Test `tool-params.test.ts:215-220` asserts post-prepare shapes consumed by execute.
**Verdict:** pass.

### Criterion 18: AC-PREPARE-4
**Evidence:** `WebSearchParams.numResults` is `Type.Integer({ minimum: 1, maximum: 20, ... })` at `index.ts:128`. `normalizeWebSearchInput` defaults/clamps `numResults` at `tool-params.ts:72-77`; tests at `tool-params.test.ts:207-213` assert default 5 and clamp to 1/20.
**Verdict:** pass.

### Criterion 19: AC-PREPARE-5
**Evidence:** `normalizeFetchContentInput` requires at least one URL and throws `Either 'url' or 'urls' must be provided.` at `tool-params.ts:106-119`. Tool-level prepare test asserts the documented error at `index.test.ts:1347-1350`.
**Verdict:** pass.

### Criterion 20: AC-PREPARE-6
**Evidence:** `tool-params.test.ts` includes focused tests for `dedupeUrls` at `5-6`, query string-to-array at `13-15`, URL dedupe at `164-166`, `numResults` default/clamping at `207-213`, freshness mapping at `93-123` and `223-230`, and all required error messages at `223-230`.
**Verdict:** pass.

### Criterion 21: AC-COMPACT-1
**Evidence:** `session-results-store.ts:6-10` defines `DEFAULT_RESULTS_DIR = join(homedir(), ".pi", "cache", "web-tools")` and `resultsFilePath(sessionId) => results-<sessionId>.json`. `snapshotStore` uses `ctx.sessionManager.getSessionId()` at `index.ts:47-52`. Tests in `session-results-store.test.ts` pass as part of full suite.
**Verdict:** pass.

### Criterion 22: AC-COMPACT-2
**Evidence:** Store+append+snapshot exists at all three store call sites: web_search `index.ts:336-338`, fetch_content `index.ts:504-506`, code_search `index.ts:871-873`. `writeStoreSnapshot` is best-effort and catches write errors at `session-results-store.ts:12-18`. Tests at `index.test.ts:1638`, `1656`, and `1673` assert per-tool snapshot files.
**Verdict:** pass.

### Criterion 23: AC-COMPACT-3
**Evidence:** `rehydrateFromDisk` reads the active session file, clears memory, and calls `storeResult` at `index.ts:54-67`. Restore branches call it at `index.ts:77`, `81`, `93`, and `99`. Test at `index.test.ts:1695-1715` asserts a disk snapshot rehydrates without reading the session log.
**Verdict:** pass.

### Criterion 24: AC-COMPACT-4
**Evidence:** `handleSessionShutdown` deletes the current session file at `index.ts:112-117`; `handleSessionStart` prunes stale files at `index.ts:70-71`; `pruneStaleStoreFiles` implements >24h deletion at `session-results-store.ts:40-61`. Tests at `index.test.ts:1722` and `session-results-store.test.ts:50-69` cover deletion/pruning.
**Verdict:** pass.

### Criterion 25: AC-COMPACT-5
**Evidence:** Regression test at `index.test.ts:1746-1813` starts extension with a fresh session, runs `web_search`, emits `session_before_compact`, clears memory, emits `session_compact`, and calls `get_search_content` with the old `responseId`. Fresh focused run output above shows this test passed.
**Verdict:** pass.

### Criterion 26: AC-COMPACT-6
**Evidence:** Test at `index.test.ts:1695-1715` writes a pre-existing disk file for the active session id, starts with `reason="resume"`, throws if `getEntries()` is called, and asserts `storage.getResult("from-disk")` is restored.
**Verdict:** pass.

### Criterion 27: AC-BATCH-1
**Evidence:** Fresh `npm test` output above exits 0 with 25 files passed and 311 tests passed. Fresh `.skip` grep returned 0 matches. New tests are included in `index.test.ts`, `tool-params.test.ts`, `session-results-store.test.ts`, and `storage.test.ts`, all listed in the passing suite.
**Verdict:** pass.

### Criterion 28: AC-BATCH-2
**Evidence:** `package.json` version read via `nu` returned `4.1.0`; `npm test` output also identifies package as `@coctostan/pi-exa-gh-web-tools@4.1.0`.
**Verdict:** pass.

### Criterion 29: AC-BATCH-3
**Evidence:** `README.md:547-552` contains `## 4.1.0` and bullets for pi-native cancellation, smarter `session_start`, `prepareArguments`, and compaction-safe result store.
**Verdict:** pass.

### Criterion 30: AC-BATCH-4
**Evidence:** Baseline v4.0.0 commit identified from git log as `cb6c425 Adapt pi-web-tools to pi 0.74.x / @earendil-works rescope (v4.0.0) (#22)`. Command `git fetch --tags origin && git tag --list '*4.0*' && git show cb6c425:index.ts | wc -l` printed `1192` and no matching tag names. Current line count via `nu` is `1190`. The meta-test at `index.test.ts:1816-1820` asserts current line count is less than 1192 and passes in the full suite.
**Verdict:** pass.

## Overall Verdict

pass

All 30 acceptance criteria are satisfied with fresh test/build output and code-inspection evidence. The compact bug reproduction/regression passes, cancellation tests no longer reference removed implementation names, and current `index.ts` (1190 lines) is strictly shorter than the v4.0.0 baseline commit (1192 lines).
