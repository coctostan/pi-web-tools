# Verification Report — 040-modernize-extension-api-uptake-signals-l

## Test Suite Results

Command run fresh:

```sh
npm test
```

Output:

```text
> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ retry.test.ts (14 tests) 6ms
 ✓ exa-search.test.ts (36 tests) 9ms
 ✓ scope-rescope.test.ts (3 tests) 7ms
 ✓ storage.test.ts (8 tests) 6ms
 ✓ session-results-store.test.ts (5 tests) 12ms
 ✓ github-extract.clone.test.ts (4 tests) 44ms
 ✓ offload.test.ts (9 tests) 11ms
 ✓ config.test.ts (18 tests) 24ms
 ✓ research-cache.test.ts (14 tests) 14ms
 ✓ exa-context.test.ts (9 tests) 7ms
 ✓ smart-search.test.ts (11 tests) 4ms
 ✓ truncation.test.ts (7 tests) 2ms
 ✓ tool-params.test.ts (41 tests) 4ms
 ✓ github-extract.test.ts (9 tests) 2ms
 ✓ smart-search.integration.test.ts (1 test) 437ms
 ✓ filter.test.ts (12 tests) 3ms
 ✓ cli.code.test.ts (2 tests) 3ms
 ✓ cli.fetch.raw.test.ts (2 tests) 5ms
 ✓ cli.search.test.ts (2 tests) 5ms
 ✓ extract.test.ts (17 tests) 147ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 2ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 2ms
 ✓ cli.usage.test.ts (2 tests) 2ms
 ✓ ptc-value.test.ts (16 tests) 997ms
 ✓ index.test.ts (67 tests) 1146ms

 Test Files  25 passed (25)
      Tests  312 passed (312)
   Start at  16:24:40
   Duration  1.55s
```

Focused verification command for new/changed test coverage:

```sh
npx vitest run index.test.ts tool-params.test.ts session-results-store.test.ts --reporter verbose
```

Output summary:

```text
 Test Files  3 passed (3)
      Tests  113 passed (113)
```

Relevant named tests from that run included:

```text
✓ session-results-store (#032 AC-COMPACT-1) > resultsFilePath returns a per-session-id path under the given root
✓ session-results-store (#032 AC-COMPACT-1) > writeStoreSnapshot persists an array of stored results that readStoreSnapshot can load
✓ session-results-store (#032 AC-COMPACT-1) > readStoreSnapshot returns empty array for missing file
✓ session-results-store (#032 AC-COMPACT-1) > deleteStoreFile removes the file (best-effort, no throw on missing)
✓ pruneStaleStoreFiles deletes files older than maxAgeMs
✓ session_start reason dispatch (#036 AC-LIFECYCLE-7) > routes session_start reason='startup' to the correct lifecycle calls
✓ session_start reason dispatch (#036 AC-LIFECYCLE-7) > routes session_start reason='reload' to the correct lifecycle calls
✓ session_start reason dispatch (#036 AC-LIFECYCLE-7) > routes session_start reason='new' to the correct lifecycle calls
✓ session_start reason dispatch (#036 AC-LIFECYCLE-7) > routes session_start reason='resume' to the correct lifecycle calls
✓ session_start reason dispatch (#036 AC-LIFECYCLE-7) > routes session_start reason='fork' to the correct lifecycle calls
✓ session_start "fork" branch (#036 AC-LIFECYCLE-6) > calls restoreFromSessionFile(event.previousSessionFile) when set
✓ web_search cancellation (#033) > forwards the execute() signal directly to searchExa (no AbortSignal.any wrapping)
✓ fetch_content cancellation (#033 AC-CANCEL-2) > forwards the execute() signal directly to extractContent
✓ fetch_content cancellation (#033 AC-CANCEL-2) > passes the execute() signal through filterContent for focused fetch completion
✓ code_search cancellation (#033) > forwards the execute() signal directly to searchContext
✓ get_search_content cancellation (#033 AC-CANCEL-4/7) > returns an aborted result when execute() receives an already-aborted signal
✓ cancellation cleanup (#033 AC-CANCEL-5/6) > index.ts has no references to pendingFetches or abortAllPending
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > web_search surfaces AbortError from searchExa when the execute() signal aborts
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > fetch_content surfaces AbortError from extractContent when the execute() signal aborts
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > code_search surfaces AbortError from searchContext when the execute() signal aborts
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > get_search_content returns an aborted result for an already-aborted execute() signal
✓ storeResult disk snapshot (#032 AC-COMPACT-2) > writes a snapshot to results-<sessionId>.json after web_search storeResult
✓ storeResult disk snapshot (#032 AC-COMPACT-2) > writes a snapshot to results-<sessionId>.json after fetch_content storeResult
✓ storeResult disk snapshot (#032 AC-COMPACT-2) > writes a snapshot to results-<sessionId>.json after code_search storeResult
✓ session_start rehydrates from disk (#032 AC-COMPACT-3/6) > loads results-<sessionId>.json without reading the session log on reason="resume"
✓ session_shutdown disk cleanup (#032 AC-COMPACT-4) > deletes results-<sessionId>.json on session_shutdown
✓ compaction-safe state (#032 AC-COMPACT-5) > get_search_content resolves a pre-compaction responseId via disk-backed store
✓ index.ts shrinkage (#040 AC-BATCH-4) > index.ts is strictly shorter than the v4.0.0 baseline of 1192 lines
```

Build command run fresh:

```sh
npm run build
```

Output:

```text
✓ Build successful (0 units compiled)
```

Impact check required before concluding coverage:

```text
impact({ symbols: ["handleSessionStart"], changeType: "behavior_change", maxDepth: 3 })
Trust: fresh
No dependents found for 'handleSessionStart' within depth 3.
```

Trace evidence:

```text
trace({ entry: "session_start", file: "index.ts" })
Trust: fresh
Symbol "session_start" not found in the graph
```

Fallback trace from the real session handler implementation:

```text
trace({ entry: "handleSessionStart", file: "index.ts" })
mode: static (heuristic, no runtime evidence)
index.ts  69:366  handleSessionStart  function [untested]
extract.ts  24:29a  clearUrlCache  function [leaf, untested]
github-extract.ts  544:36f  clearCloneCache  function [leaf, untested]
index.ts  54:239  rehydrateFromDisk  function [untested]
session-results-store.ts  8:729  resultsFilePath  function [leaf, untested]
session-results-store.ts  21:9f9  readStoreSnapshot  function [leaf, untested]
storage.ts  52:d66  storeResult  function [leaf, untested]
storage.ts  83:882  clearResults  function [leaf, untested]
offload.ts  61:9ad  cleanupTempFiles  function [leaf, untested]
session-results-store.ts  40:8e1  pruneStaleStoreFiles  function [untested]
session-results-store.ts  32:822  deleteStoreFile  function [leaf, untested]
storage.ts  87:5a5  restoreFromSession  function [leaf, untested]
storage.ts  115:b66  restoreFromSessionFile  function [untested]
```

Bug/symptom reproduction for #032: the focused test `compaction-safe state (#032 AC-COMPACT-5) > get_search_content resolves a pre-compaction responseId via disk-backed store` performs the described reproduction: creates a fresh session id, runs `web_search`, emits `session_before_compact`, clears in-memory results to simulate appendEntry records becoming unreachable, emits `session_compact`, then calls `get_search_content` with the original responseId. It passed in the fresh focused run.

## Per-Criterion Verification

### Criterion 1: AC-CANCEL-1
**Identify/Run:** Inspected `index.ts` `web_search.execute`; searched for forbidden cancellation plumbing.

**Evidence:**
- `index.ts:190` has `prepareArguments` for web_search; `index.ts:192` execute receives `signal`.
- `index.ts:209-216` calls `findSimilarExa(..., { ..., signal, ... })`.
- `index.ts:265-275` calls `searchExa(..., { ..., signal, ... })`.
- `grep "pendingFetches|abortAllPending|AbortSignal\.any|new AbortController" index.ts` returned `0 matches in 0 files`.
- Focused test passed: `web_search cancellation (#033) > forwards the execute() signal directly to searchExa (no AbortSignal.any wrapping)`.

**Verdict:** pass.

### Criterion 2: AC-CANCEL-2
**Identify/Run:** Inspected `fetch_content.execute` downstream calls and focused tests.

**Evidence:**
- `index.ts:445` execute receives `signal`.
- `index.ts:456` calls `extractGitHub(targetUrl, signal, forceClone)`.
- `index.ts:463` calls `extractContent(targetUrl, signal)`.
- `index.ts:520-527` and `index.ts:671-678` pass `signal` to `filterContent` along with `complete`.
- No `fetchAllContent(` call exists in `index.ts` grep results.
- No forbidden cancellation plumbing in `index.ts` (`grep` returned 0 matches).
- Focused tests passed for direct `extractContent` signal forwarding and `filterContent` signal forwarding.

**Verdict:** pass.

### Criterion 3: AC-CANCEL-3
**Identify/Run:** Inspected `code_search.execute`; checked focused tests.

**Evidence:**
- `index.ts:847` execute receives `signal`.
- `index.ts:853-857` calls `searchContext(query, { apiKey, tokensNum, signal })`.
- Focused test passed: `code_search cancellation (#033) > forwards the execute() signal directly to searchContext`.

**Verdict:** pass.

### Criterion 4: AC-CANCEL-4
**Identify/Run:** Inspected `get_search_content.execute`; checked cancellation test.

**Evidence:**
- `index.ts:970-977` receives `signal` and immediately returns an aborted error result when `signal?.aborted`.
- No downstream fetch/complete calls exist in `get_search_content.execute`.
- Focused test passed: `get_search_content cancellation (#033 AC-CANCEL-4/7) > returns an aborted result when execute() receives an already-aborted signal`.

**Verdict:** pass.

### Criterion 5: AC-CANCEL-5
**Identify/Run:** Searched `index.ts` for removed symbols.

**Evidence:**

```text
grep "pendingFetches|abortAllPending|AbortSignal\.any|new AbortController" index.ts
[0 matches in 0 files]
```

Focused test passed: `cancellation cleanup (#033 AC-CANCEL-5/6) > index.ts has no references to pendingFetches or abortAllPending`.

**Verdict:** pass.

### Criterion 6: AC-CANCEL-6
**Identify/Run:** Inspected session handlers and forbidden-symbol grep.

**Evidence:**
- `index.ts:69-110` `handleSessionStart` branches by `event.reason`; no `abortAllPending` call.
- `index.ts:112-122` `handleSessionShutdown` deletes disk store and clears caches/results; no `abortAllPending` call.
- `grep` for `abortAllPending` returned 0 matches.

**Verdict:** pass.

### Criterion 7: AC-CANCEL-7
**Identify/Run:** Checked tests and ran focused test suite.

**Evidence:** Focused run passed these per-tool tests:

```text
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > web_search surfaces AbortError from searchExa when the execute() signal aborts
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > fetch_content surfaces AbortError from extractContent when the execute() signal aborts
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > code_search surfaces AbortError from searchContext when the execute() signal aborts
✓ per-tool in-flight cancellation (#033 AC-CANCEL-7) > get_search_content returns an aborted result for an already-aborted execute() signal
```

Source evidence: `index.test.ts:1474-1580` constructs `AbortController`s, passes `controller.signal` to `execute(...)`, aborts, and asserts abort results. `grep` for `.skip` in `*.test.ts` returned `0 matches in 0 files`.

**Verdict:** pass.

### Criterion 8: AC-LIFECYCLE-1
**Identify/Run:** Inspected handler registration and symbol graph.

**Evidence:**
- `index.ts:1` imports `SessionStartEvent`.
- `index.ts:69` declares `function handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void`.
- `index.ts:139-141` registers `pi.on("session_start", async (event, ctx) => { handleSessionStart(event, ctx); });`.

Symbol graph source:

```text
## handleSessionStart (function)
index.ts  69:366
Signature: (event: SessionStartEvent, ctx: ExtensionContext) => void
```

**Verdict:** pass.

### Criterion 9: AC-LIFECYCLE-2
**Identify/Run:** Inspected `startup` branch and tests.

**Evidence:** `index.ts:73-78` for `startup` calls in order:

```text
clearCloneCache();
clearUrlCache();
cleanupTempFiles();
if (!rehydrateFromDisk(ctx)) restoreFromSession(ctx);
```

Focused test passed: `routes session_start reason='startup' to the correct lifecycle calls`.

**Verdict:** pass.

### Criterion 10: AC-LIFECYCLE-3
**Identify/Run:** Inspected `reload` branch and test.

**Evidence:** `index.ts:79-82` for `reload` calls `clearCloneCache()` and restore fallback only; it does not call `clearUrlCache()` or `cleanupTempFiles()` in that branch. Focused tests passed:

```text
✓ routes session_start reason='reload' to the correct lifecycle calls
✓ session_start with reason="reload" preserves URL cache and temp files but still clears clone cache and restores results (#036 AC-LIFECYCLE-3)
```

**Verdict:** pass.

### Criterion 11: AC-LIFECYCLE-4
**Identify/Run:** Inspected `new` branch and tests.

**Evidence:** `index.ts:83-88` for `new` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, `clearResults()`, and returns without `restoreFromSession(ctx)`. Focused tests passed:

```text
✓ routes session_start reason='new' to the correct lifecycle calls
✓ session_start "new" (#036 AC-LIFECYCLE-4) > clears the in-memory result store and does NOT call restoreFromSession
```

**Verdict:** pass.

### Criterion 12: AC-LIFECYCLE-5
**Identify/Run:** Inspected `resume` branch and disk restore test.

**Evidence:** `index.ts:89-94` for `resume` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, then `if (!rehydrateFromDisk(ctx)) restoreFromSession(ctx)`. Focused tests passed:

```text
✓ routes session_start reason='resume' to the correct lifecycle calls
✓ session_start rehydrates from disk (#032 AC-COMPACT-3/6) > loads results-<sessionId>.json without reading the session log on reason="resume"
```

**Verdict:** pass.

### Criterion 13: AC-LIFECYCLE-6
**Identify/Run:** Inspected `fork` branch and tests.

**Evidence:** `index.ts:95-107` for `fork` calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, attempts disk rehydrate, then calls `restoreFromSessionFile(event.previousSessionFile)` when present or `restoreFromSession(ctx)` otherwise. `storage.ts:1` imports `loadEntriesFromFile`; `storage.ts:115-120` implements `restoreFromSessionFile(sessionFilePath)` by calling `loadEntriesFromFile(sessionFilePath)`.

Focused tests passed:

```text
✓ session_start "fork" branch (#036 AC-LIFECYCLE-6) > calls restoreFromSessionFile(event.previousSessionFile) when set
✓ session_start "fork" branch (#036 AC-LIFECYCLE-6) > falls back to restoreFromSession(ctx) when previousSessionFile is absent
```

**Verdict:** pass.

### Criterion 14: AC-LIFECYCLE-7
**Identify/Run:** Checked parameterized tests and ran focused suite.

**Evidence:** `index.test.ts:299-326` defines `it.each(cases)` with `startup`, `reload`, `new`, `resume`, `fork` and asserts clear/restore calls. `index.test.ts:398-405` asserts fork uses `event.previousSessionFile`. Focused output shows all five parameterized cases and fork file test passed.

**Verdict:** pass.

### Criterion 15: AC-PREPARE-1
**Identify/Run:** Used structural search for `pi.registerTool` with `prepareArguments` and inspected lines.

**Evidence:** `ast_search` found all four tool registrations with `prepareArguments`:

- `index.ts:190` `prepareArguments: (raw) => normalizeWebSearchInput(raw as any) as any`
- `index.ts:443` `prepareArguments: (raw) => normalizeFetchContentInput(raw as any) as any`
- `index.ts:845` `prepareArguments: (raw) => normalizeCodeSearchInput(raw as any) as any`
- `index.ts:968` `prepareArguments: (raw) => normalizeGetSearchContentInput(raw as any) as any`

Focused prepareArguments tests for all four tools passed.

**Verdict:** pass.

### Criterion 16: AC-PREPARE-2
**Identify/Run:** Searched for runtime normalization calls in execute bodies.

**Evidence:**

```text
grep "normalize.*Input\(params" index.ts
[0 matches in 0 files]
```

Source shows execute bodies destructure prepared `params`: `index.ts:193`, `index.ts:446`, `index.ts:848`, `index.ts:978`. Focused tests passed for each tool's `execute does not re-normalize`.

**Verdict:** pass.

### Criterion 17: AC-PREPARE-3
**Identify/Run:** Inspected `tool-params.ts` return types and shape tests.

**Evidence:**
- `tool-params.ts:13-23` `NormalizedWebSearchInput` includes `queries`, `numResults`, filters, `maxAgeHours`, `similarUrl` consumed by `index.ts:193`.
- `tool-params.ts:25-30` `NormalizedFetchContentInput` includes `urls`, `forceClone`, `prompt`, `noCache` consumed by `index.ts:446`.
- `tool-params.ts:32-35` `NormalizedCodeSearchInput` includes `query`, `tokensNum` consumed by `index.ts:848`.
- `tool-params.ts:37-44` `NormalizedGetSearchContentInput` includes fields consumed by `index.ts:978`.
- Focused test passed: `normalize prepare functions produce the post-prepare shapes consumed by execute (AC-PREPARE-3)`.

**Verdict:** pass.

### Criterion 18: AC-PREPARE-4
**Identify/Run:** Inspected schema and prepare function tests.

**Evidence:**
- `index.ts:128` defines `numResults: Type.Integer({ minimum: 1, maximum: 20, ... })`.
- `tool-params.ts:72-77` clamps/defaults `numResults` to 1..20, default 5.
- Focused test passed: `normalizeWebSearchInput defaults and clamps numResults for prepareArguments (AC-PREPARE-4)`.

**Verdict:** pass.

### Criterion 19: AC-PREPARE-5
**Identify/Run:** Inspected prepare validation and tests.

**Evidence:**
- `tool-params.ts:106-119` builds a URL list from `url`/`urls`, throws `Either 'url' or 'urls' must be provided.` when empty, and dedupes.
- Focused test passed: `fetch_content prepareArguments (#037) > fetch_content prepareArguments throws the documented error when neither url nor urls is provided (AC-PREPARE-5)`.

**Verdict:** pass.

### Criterion 20: AC-PREPARE-6
**Identify/Run:** Inspected `tool-params.test.ts` and ran focused tests.

**Evidence:**
- `tool-params.test.ts:13-14` covers single `query` to `queries` array.
- `tool-params.test.ts:164-165` covers `urls` dedupe; `tool-params.test.ts:215-218` covers `url` to `urls` and post-prepare shapes.
- `tool-params.test.ts:207-212` covers `numResults` defaulting/clamping.
- `tool-params.test.ts:93-117` and `223-224` cover freshness mapping.
- `tool-params.test.ts:5-6` and `164-165` cover URL dedupe.
- `tool-params.test.ts:223-229` asserts all required documented error messages.
- Focused output: `tool-params.test.ts` 41 tests passed.

**Verdict:** pass.

### Criterion 21: AC-COMPACT-1
**Identify/Run:** Inspected result-store module and tests.

**Evidence:**
- `session-results-store.ts:6` `DEFAULT_RESULTS_DIR = join(homedir(), ".pi", "cache", "web-tools")`.
- `session-results-store.ts:8-10` returns `join(dir, \`results-${sessionId}.json\`)`.
- `session-results-store.ts:12-19` persists snapshots as JSON.
- `index.ts:47-52` snapshots `getAllResults()` to `resultsFilePath(sessionId, dir)` using `ctx.sessionManager.getSessionId()`.
- Focused `session-results-store (#032 AC-COMPACT-1)` tests passed.

**Verdict:** pass.

### Criterion 22: AC-COMPACT-2
**Identify/Run:** Inspected store/append sites and tests.

**Evidence:** Store/append/snapshot sequences exist at:
- `web_search`: `index.ts:336-338` `storeResult`, `pi.appendEntry`, `snapshotStore(ctx)`.
- `fetch_content`: `index.ts:504-506` `storeResult`, `pi.appendEntry`, `snapshotStore(ctx)`.
- `code_search`: `index.ts:871-873` `storeResult`, `pi.appendEntry`, `snapshotStore(ctx)`.

`session-results-store.ts:12-18` swallows write errors as best effort. Focused tests passed for all three snapshot-after-store cases.

**Verdict:** pass.

### Criterion 23: AC-COMPACT-3
**Identify/Run:** Inspected session_start rehydrate and test.

**Evidence:**
- `index.ts:54-67` `rehydrateFromDisk(ctx)` reads `results-<sessionId>.json`, clears in-memory results, and `storeResult`s entries.
- `index.ts:77`, `81`, `93`, and `99-104` prefer `rehydrateFromDisk(ctx)` before session-log restore for startup/reload/resume/fork.
- Focused test passed: `loads results-<sessionId>.json without reading the session log on reason="resume"`.

**Verdict:** pass.

### Criterion 24: AC-COMPACT-4
**Identify/Run:** Inspected shutdown/session_start cleanup and tests.

**Evidence:**
- `index.ts:112-117` deletes the current session's `results-<sessionId>.json` on shutdown via `deleteStoreFile(resultsFilePath(sessionId, dir))`.
- `index.ts:69-71` prunes stale files older than 24h on session_start with `pruneStaleStoreFiles(initialDir, 24 * 60 * 60 * 1000)`.
- `session-results-store.ts:40-61` deletes `results-*.json` files older than `maxAgeMs`.
- Focused tests passed: `pruneStaleStoreFiles deletes files older than maxAgeMs` and `session_shutdown disk cleanup (#032 AC-COMPACT-4) > deletes results-<sessionId>.json on session_shutdown`.

**Verdict:** pass.

### Criterion 25: AC-COMPACT-5
**Identify/Run:** Ran focused regression test and inspected test body.

**Evidence:** `index.test.ts:1759-1821` starts a fresh session id, runs `web_search`, emits `session_before_compact`, clears in-memory results, emits `session_compact`, then calls `get_search_content` with the pre-compaction `responseId`. Focused test passed: `compaction-safe state (#032 AC-COMPACT-5) > get_search_content resolves a pre-compaction responseId via disk-backed store`.

**Verdict:** pass.

### Criterion 26: AC-COMPACT-6
**Identify/Run:** Ran focused rehydrate test and inspected test body.

**Evidence:** `index.test.ts:1705-1722` writes a disk snapshot for `rehydrate-sid`, makes `getEntries` throw if called, emits `session_start` reason `resume`, and asserts `storage.getResult("from-disk")` exists and `getEntries` was not called. Focused test passed.

**Verdict:** pass.

### Criterion 27: AC-BATCH-1
**Identify/Run:** Ran full suite and searched for skipped tests.

**Evidence:** `npm test` output shows `Test Files 25 passed (25)` and `Tests 312 passed (312)`. `grep ".skip|skip\(" . --glob "*.test.ts"` returned `0 matches in 0 files`.

**Verdict:** pass.

### Criterion 28: AC-BATCH-2
**Identify/Run:** Inspected `package.json`.

**Evidence:** `package.json:3` is `
"version": "4.1.0"`.

**Verdict:** pass.

### Criterion 29: AC-BATCH-3
**Identify/Run:** Inspected README changelog.

**Evidence:** `README.md:547-552` contains `## 4.1.0` and bullets for pi-native cancellation, smarter `session_start` lifecycle, `prepareArguments` adoption, and compaction-safe result store.

**Verdict:** pass.

### Criterion 30: AC-BATCH-4
**Identify/Run:** Ran the specified line-count command against the v4.0.0 tag and current file; also checked the regression test's baseline evidence.

**Evidence:**

```text
git show v4.0.0:index.ts | wc -l && wc -l index.ts
fatal: invalid object name 'v4.0.0'.
       0
    1190 index.ts
```

Additional evidence from focused tests:

```text
✓ index.ts shrinkage (#040 AC-BATCH-4) > index.ts is strictly shorter than the v4.0.0 baseline of 1192 lines
```

Source evidence: `index.test.ts:1826-1830` asserts the current line count is less than the recorded v4.0.0 baseline of 1192 lines.

**Verdict:** partial. Current `index.ts` is 1190 lines and passes the repository's baseline test, but the literal `v4.0.0` git tag is absent in this checkout, so I could not independently measure the old line count from the tag as the acceptance criterion specifies.

## Overall Verdict

partial / fail gate

29 of 30 criteria are verified as pass. AC-BATCH-4 is only partial because the implementation passes the local baseline test and current line count is below 1192, but the required `v4.0.0` tag is not available for the specified independent `git show v4.0.0:index.ts | wc -l` measurement.

Because the verification gate requires every criterion to be proven with evidence, this should return to implementation/workflow handling to either add/restore the needed tag evidence in the verification environment or document an accepted baseline source for AC-BATCH-4.