# Verify — 040-modernize-extension-api-uptake-signals-l

## Test Suite Results

Command run fresh:

```bash
npm test
```

Output:

```text
> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ scope-rescope.test.ts (3 tests) 6ms
 ✓ truncation.test.ts (7 tests) 2ms
 ✓ exa-search.test.ts (36 tests) 10ms
 ✓ retry.test.ts (14 tests) 12ms
 ✓ config.test.ts (18 tests) 10ms
 ✓ session-results-store.test.ts (5 tests) 4ms
 ✓ github-extract.clone.test.ts (4 tests) 42ms
 ✓ research-cache.test.ts (14 tests) 7ms
 ✓ offload.test.ts (9 tests) 5ms
 ✓ exa-context.test.ts (9 tests) 5ms
 ✓ storage.test.ts (8 tests) 3ms
 ✓ smart-search.test.ts (11 tests) 9ms
 ✓ tool-params.test.ts (41 tests) 7ms
 ✓ github-extract.test.ts (9 tests) 3ms
 ✓ smart-search.integration.test.ts (1 test) 430ms
 ✓ filter.test.ts (12 tests) 56ms
 ✓ cli.search.test.ts (2 tests) 5ms
 ✓ cli.code.test.ts (2 tests) 8ms
 ✓ extract.test.ts (17 tests) 142ms
 ✓ cli.fetch.raw.test.ts (2 tests) 2ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 5ms
 ✓ cli.usage.test.ts (2 tests) 4ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 2ms
 ✓ ptc-value.test.ts (16 tests) 1010ms
 ✓ index.test.ts (67 tests) 1138ms

 Test Files  25 passed (25)
      Tests  312 passed (312)
   Duration  1.55s
```

Additional build check:

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

Impact check requested by workflow:

```text
impact(["handleSessionStart", "snapshotStore", "rehydrateFromDisk"], behavior_change):
No dependents found for 'handleSessionStart' within depth 3.
No dependents found for 'snapshotStore' within depth 3.
No dependents found for 'rehydrateFromDisk' within depth 3.
```

Trace check from lifecycle handler:

```text
trace(handleSessionStart):
mode: static (heuristic, no runtime evidence)
index.ts 69 handleSessionStart
extract.ts clearUrlCache
github-extract.ts clearCloneCache
index.ts rehydrateFromDisk
session-results-store.ts resultsFilePath/readStoreSnapshot/pruneStaleStoreFiles/deleteStoreFile
storage.ts storeResult/clearResults/restoreFromSession/restoreFromSessionFile
offload.ts cleanupTempFiles
```

Symbol card used for lifecycle verification:

```text
handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void
index.ts 69-110
Callees include pruneStaleStoreFiles, clearResults, clearCloneCache, clearUrlCache, cleanupTempFiles, restoreFromSession, restoreFromSessionFile.
Source branches on event.reason for startup/reload/new/resume/fork.
```

## Bug/Symptom Reproduction

Original compact symptom: after `/compact`, prior `responseId`s became unreachable and `get_search_content` returned `No result found...`.

Focused regression command run fresh:

```bash
npx vitest run index.test.ts -t "compaction-safe state"
```

Output:

```text
 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ index.test.ts (67 tests | 66 skipped) 523ms
   ✓ compaction-safe state (#032 AC-COMPACT-5) > get_search_content resolves a pre-compaction responseId via disk-backed store  522ms

 Test Files  1 passed (1)
      Tests  1 passed | 66 skipped (67)
```

This reproduces the compact sequence by running `web_search`, emitting `session_before_compact`, clearing in-memory results, emitting `session_compact`, then calling `get_search_content` with the old `responseId`; the regression test passes.

## Per-Criterion Verification

### Criterion 1: AC-CANCEL-1
**Evidence:** `index.ts:192-272` has `web_search.execute(..., signal, ...)`; `findSimilarExa` receives `signal` at `index.ts:209-216`; `searchExa` receives `signal` at `index.ts:265-275`. `grep "pendingFetches|abortAllPending|new AbortController|AbortSignal\\.any" index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 2: AC-CANCEL-2
**Evidence:** `fetch_content.execute(..., signal, ...)` at `index.ts:445`; `extractGitHub(targetUrl, signal, forceClone)` at `index.ts:456`; `extractContent(targetUrl, signal)` at `index.ts:463`; `filterContent(..., complete, signal)` at `index.ts:520-527` and `index.ts:671-678`. No `fetchAllContent` calls are present in `index.ts`. Forbidden cancellation grep in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 3: AC-CANCEL-3
**Evidence:** `code_search.execute(..., signal, ...)` at `index.ts:847`; `searchContext(query, { ..., signal })` at `index.ts:853-857`. Forbidden cancellation grep in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 4: AC-CANCEL-4
**Evidence:** `get_search_content.execute(..., signal, ...)` at `index.ts:970`; the body checks `signal?.aborted` and returns an aborted error result at `index.ts:971-977`; there are no downstream `complete` or fetch calls in this executor. Forbidden cancellation grep in `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 5: AC-CANCEL-5
**Evidence:** `grep "pendingFetches|abortAllPending|new AbortController|AbortSignal\\.any" index.ts` returned `[0 matches in 0 files]`; module-scope lines `1-137` contain no `pendingFetches` Map or `abortAllPending` helper.
**Verdict:** pass.

### Criterion 6: AC-CANCEL-6
**Evidence:** `handleSessionStart` at `index.ts:69-110` and `handleSessionShutdown` at `index.ts:112-122` contain no `abortAllPending`; the same forbidden grep over `index.ts` returned 0 matches.
**Verdict:** pass.

### Criterion 7: AC-CANCEL-7
**Evidence:** Positive cancellation tests exist for all tools in `index.test.ts:1471-1582`:
- `web_search surfaces AbortError...` at `1474-1500`
- `fetch_content surfaces AbortError...` at `1502-1528`
- `code_search surfaces AbortError...` at `1530-1557`
- `get_search_content returns an aborted result...` at `1559-1581`

However, the criterion also says tests do not reference `pendingFetches` or `abortAllPending`. `grep "pendingFetches|abortAllPending" index.test.ts` found references at `index.test.ts:1457` and `index.test.ts:1463-1466`, including a negative assertion that reads `index.ts` and checks those names are absent.
**Verdict:** fail. The behavior tests exist and pass, but the acceptance criterion explicitly forbids any test references to these names.

### Criterion 8: AC-LIFECYCLE-1
**Evidence:** `index.ts:1` imports `SessionStartEvent`; `handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext)` is at `index.ts:69`; registration is `pi.on("session_start", async (event, ctx) => { handleSessionStart(event, ctx); })` at `index.ts:139-141`.
**Verdict:** pass.

### Criterion 9: AC-LIFECYCLE-2
**Evidence:** Startup branch at `index.ts:73-78` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, then `restoreFromSession(ctx)` if disk rehydrate is absent. `index.test.ts:299-326` parameterizes `startup` with `clearUrl: true`, `cleanup: true`, `restore: true` and asserts calls.
**Verdict:** pass.

### Criterion 10: AC-LIFECYCLE-3
**Evidence:** Reload branch at `index.ts:79-82` calls `clearCloneCache()` and restore, but does not call `clearUrlCache()` or `cleanupTempFiles()`. Test at `index.test.ts:333-348` asserts URL cache and temp cleanup are not called, clone cache is called, and session entries are read.
**Verdict:** pass.

### Criterion 11: AC-LIFECYCLE-4
**Evidence:** New branch at `index.ts:83-88` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, and `clearResults()`; it returns without calling `restoreFromSession`. Test at `index.test.ts:1585-1603` seeds storage, emits `reason: "new"`, asserts the old result is gone and `getEntries` was not called.
**Verdict:** pass.

### Criterion 12: AC-LIFECYCLE-5
**Evidence:** Resume branch at `index.ts:89-94` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, then `rehydrateFromDisk(ctx)` or `restoreFromSession(ctx)`. Parameterized lifecycle test at `index.test.ts:299-326` covers `resume` with cleanup and restore expected.
**Verdict:** pass.

### Criterion 13: AC-LIFECYCLE-6
**Evidence:** Fork branch at `index.ts:95-107` cleans caches/temp files, tries disk rehydrate, calls `restoreFromSessionFile(event.previousSessionFile)` when present, otherwise `restoreFromSession(ctx)`. `storage.ts:115-140` defines `restoreFromSessionFile` using `loadEntriesFromFile`. Tests at `index.test.ts:398-416` assert the previous session file path is passed and fallback restore happens when absent.
**Verdict:** pass.

### Criterion 14: AC-LIFECYCLE-7
**Evidence:** Parameterized test cases for `startup`, `reload`, `new`, `resume`, and `fork` are at `index.test.ts:299-326`, asserting `clearUrlCache`, `cleanupTempFiles`, `clearResults`, `restoreFromSession`, and `restoreFromSessionFile` behavior. Dedicated fork previous-file tests are at `index.test.ts:398-416` and assert `/tmp/parent.session` was passed.
**Verdict:** pass.

### Criterion 15: AC-PREPARE-1
**Evidence:** `prepareArguments` is present in all four registrations:
- `web_search`: `index.ts:190`
- `fetch_content`: `index.ts:443`
- `code_search`: `index.ts:845`
- `get_search_content`: `index.ts:968`

AST search for `pi.registerTool({ ..., prepareArguments: (raw) => normalize*Input(...) })` found all four registerTool blocks.
**Verdict:** pass.

### Criterion 16: AC-PREPARE-2
**Evidence:** Executor bodies destructure `params` directly at `index.ts:193`, `446`, `848`, and `978`. Grep for `normalizeWebSearchInput(params|normalizeFetchContentInput(params|normalizeCodeSearchInput(params|normalizeGetSearchContentInput(params` found no executor calls.
**Verdict:** pass.

### Criterion 17: AC-PREPARE-3
**Evidence:** `tool-params.ts:13-44` defines normalized return types matching executor consumption; functions return these shapes at `tool-params.ts:103`, `119`, `136`, and `166`. Test `tool-params.test.ts:215-220` asserts the post-prepare shapes consumed by executors.
**Verdict:** pass.

### Criterion 18: AC-PREPARE-4
**Evidence:** `WebSearchParams.numResults` is `Type.Integer({ minimum: 1, maximum: 20, ... })` at `index.ts:128`. Clamping/defaulting in `normalizeWebSearchInput` is at `tool-params.ts:72-77`; tests at `tool-params.test.ts:207-213` assert default 5 and clamp to 1/20.
**Verdict:** pass.

### Criterion 19: AC-PREPARE-5
**Evidence:** `normalizeFetchContentInput` enforces at least one URL and preserves the user-facing error at `tool-params.ts:106-119`, throwing `Either 'url' or 'urls' must be provided.` at `tool-params.ts:112-114`. Tool-level test at `index.test.ts:1347-1350` asserts this error through `prepareArguments`.
**Verdict:** pass.

### Criterion 20: AC-PREPARE-6
**Evidence:** `tool-params.test.ts` has focused normalization coverage: query string-to-array at `13-15`, URL array dedupe at `164-166`, `numResults` default/clamp at `207-213`, freshness mapping at `93-123` and `223-230`, and documented error messages at `223-230`.
**Verdict:** pass.

### Criterion 21: AC-COMPACT-1
**Evidence:** `session-results-store.ts:6-10` defines `DEFAULT_RESULTS_DIR = join(homedir(), ".pi", "cache", "web-tools")` and `resultsFilePath(sessionId) => results-<sessionId>.json`. `index.ts:47-52` writes snapshots using `ctx.sessionManager.getSessionId()`. Tests at `session-results-store.test.ts:13-33` verify per-session file path and read/write.
**Verdict:** pass.

### Criterion 22: AC-COMPACT-2
**Evidence:** Store+append+snapshot sequence exists in each relevant tool:
- web_search: `index.ts:336-338`
- fetch_content: `index.ts:504-506`
- code_search: `index.ts:871-873`
`writeStoreSnapshot` is best-effort and catches write errors at `session-results-store.ts:12-18`. Tests at `index.test.ts:1645-1699` assert snapshot files after web/fetch/code tool calls.
**Verdict:** pass.

### Criterion 23: AC-COMPACT-3
**Evidence:** `rehydrateFromDisk` at `index.ts:54-67` reads the active session file, clears memory, and stores entries. `handleSessionStart` calls it before `restoreFromSession` on startup/reload/resume/fork at `index.ts:77`, `81`, `93`, and `99-104`. Test `index.test.ts:1702-1725` asserts resume with a pre-existing disk file does not call `getEntries`.
**Verdict:** pass.

### Criterion 24: AC-COMPACT-4
**Evidence:** `handleSessionShutdown` deletes the current session file at `index.ts:112-117`. `handleSessionStart` prunes stale files older than 24h at `index.ts:70-71`; `pruneStaleStoreFiles` implements age-based deletion at `session-results-store.ts:40-61`. Tests: shutdown deletion at `index.test.ts:1729-1752`; stale pruning at `session-results-store.test.ts:50-69`.
**Verdict:** pass.

### Criterion 25: AC-COMPACT-5
**Evidence:** Regression test at `index.test.ts:1756-1823` starts a session, runs `web_search`, emits `session_before_compact`, clears memory, emits `session_compact`, then calls `get_search_content` with the old `responseId`. Focused run output above shows this test passed.
**Verdict:** pass.

### Criterion 26: AC-COMPACT-6
**Evidence:** `index.test.ts:1702-1725` writes a disk snapshot, starts a fresh session with matching session id, throws if `getEntries()` is called, and asserts `storage.getResult("from-disk")` is restored and `getEntries` is not called.
**Verdict:** pass.

### Criterion 27: AC-BATCH-1
**Evidence:** Full `npm test` output above exits with 25 files passed and 312 tests passed. `.skip` grep returned 0 matches in `*.test.ts`.
**Verdict:** pass.

### Criterion 28: AC-BATCH-2
**Evidence:** `package.json` version read via `nu` returned `4.1.0`.
**Verdict:** pass.

### Criterion 29: AC-BATCH-3
**Evidence:** README changelog section exists at `README.md:547-552` with `## 4.1.0` and bullets for pi-native cancellation, smarter `session_start`, `prepareArguments`, and compaction-safe result store.
**Verdict:** pass.

### Criterion 30: AC-BATCH-4
**Evidence:** Current line count via `nu` is 1190 lines. `index.test.ts:1826-1831` asserts current `index.ts` is less than a v4.0.0 baseline of 1192 lines. However, direct verification against the requested `v4.0.0` tag failed:

```bash
git show v4.0.0:index.ts | wc -l
fatal: invalid object name 'v4.0.0'.
       0

git tag --list '*4.0*'
(no output)
```

**Verdict:** partial. The repository has a passing test against a 1192-line baseline and current file has 1190 lines, but the actual `v4.0.0` tag is absent locally, so the exact tag comparison required by the criterion could not be independently verified.

## Overall Verdict

fail

The implementation satisfies most functional criteria and the full suite passes, but verification cannot pass overall because:

1. **AC-CANCEL-7 fails**: `index.test.ts` still references `pendingFetches` and `abortAllPending`, even though only in negative assertions.
2. **AC-BATCH-4 is only partial**: current `index.ts` is below the test's 1192-line baseline, but the local repository has no `v4.0.0` tag to independently measure the requested tag comparison.

Recommended next steps:
- Remove `pendingFetches` / `abortAllPending` references from tests while preserving behavior-based cancellation coverage.
- Fetch or provide the `v4.0.0` tag, or document an accepted baseline source for AC-BATCH-4, then rerun the line-count verification.
