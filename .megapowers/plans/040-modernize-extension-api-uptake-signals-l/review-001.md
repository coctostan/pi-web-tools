---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 3
  - 5
  - 9
  - 12
  - 13
  - 14
  - 15
  - 17
  - 21
  - 23
  - 24
  - 2
  - 4
  - 6
  - 7
  - 8
  - 10
  - 11
  - 16
  - 18
  - 19
  - 20
  - 22
  - 25
approved_tasks:
  - 1
  - 3
  - 5
  - 9
  - 12
  - 13
  - 14
  - 15
  - 17
  - 21
  - 23
  - 24
needs_revision_tasks:
  - 2
  - 4
  - 6
  - 7
  - 8
  - 10
  - 11
  - 16
  - 18
  - 19
  - 20
  - 22
  - 25
---

### Task 1: web_search: forward execute()'s signal directly to Exa calls — ✅ PASS
Covers AC-CANCEL-1 with a direct signal identity test and plausible implementation.

### Task 2: fetch_content: forward execute()'s signal directly to extractors — ❌ REVISE
- AC-CANCEL-2 also requires `filterContent` and downstream `complete(...)` calls to receive the pi-provided `signal`. The real `filterContent` signature has no signal parameter and calls `completeFn(model, context, { apiKey, headers })`; the task only updates `extractContent` / `extractGitHub`.

### Task 3: code_search: forward execute()'s signal directly to searchContext — ✅ PASS
Covers direct signal forwarding into the real `searchContext(query, options)` API.

### Task 4: get_search_content: drop unused signal-wrapping plumbing — ❌ REVISE
- Not a valid red/green TDD task: Step 2 admits the test may already pass and Step 3 expects no production code change.
- Does not satisfy AC-CANCEL-7 because it does not drive an aborted `signal` through `execute(...)` or document the no-fetch/no-complete exception for this tool.

### Task 5: Remove pendingFetches Map and abortAllPending helper — ✅ PASS
Covers AC-CANCEL-5 and AC-CANCEL-6.

### Task 6: In-flight cancellation regression test for fetch_content — ❌ REVISE
- AC-CANCEL-7 requires at least one cancellation test per tool; this only covers `fetch_content`.
- The proposed RED is inaccurate because the current `AbortSignal.any([externalSignal, abortController.signal])` still aborts when `externalSignal` aborts.

### Task 7: handleSessionStart receives SessionStartEvent and routes by reason — ❌ REVISE
- Does not satisfy AC-LIFECYCLE-7; it adds only a no-op fork smoke test (`expect(true).toBe(true)`) rather than parameterized branch assertions for all five reasons.
- Needs explicit positive/negative assertions for `clearUrlCache`, `cleanupTempFiles`, `clearResults`, and restore behavior.

### Task 8: session_start "new" reason clears the in-memory result store — ❌ REVISE
- Test seeds `storage.ts` before `getSessionHandlers()`, but that helper calls `vi.resetModules()`, so the handler uses a different module instance. The test can pass without proving `clearResults()` was called.

### Task 9: Add restoreFromSessionFile helper that reads parent session log — ✅ PASS
Uses the requested `loadEntriesFromFile(path)` API and mirrors existing restore validation.

### Task 10: session_start "fork" branch uses event.previousSessionFile — ❌ REVISE
- The `vi.spyOn(storage, ...)` tests spy on a module instance that is discarded by `getSessionHandlers()` calling `vi.resetModules()`, so they will not observe calls made by `index.ts`.

### Task 11: session_start "reload" preserves URL cache and temp files — ❌ REVISE
- Same module-instance spy problem as Task 10 for `restoreFromSession`.

### Task 12: Adopt prepareArguments for web_search — ✅ PASS
Covers AC-PREPARE-1/2 for `web_search`.

### Task 13: Adopt prepareArguments for fetch_content — ✅ PASS
Covers AC-PREPARE-1/2 and the user-facing missing-url error for `fetch_content`.

### Task 14: Adopt prepareArguments for code_search — ✅ PASS
Covers AC-PREPARE-1/2 for `code_search`.

### Task 15: Adopt prepareArguments for get_search_content — ✅ PASS
Covers AC-PREPARE-1/2 for `get_search_content`.

### Task 16: Tighten WebSearchParams.numResults to a bounded integer — ❌ REVISE
- AC-PREPARE-3 and AC-PREPARE-6 are missing from the plan.
- Needs focused tests for all required normalization/error cases, including `normalizeGetSearchContentInput`, and explicit return-type updates matching post-prepare execute params.

### Task 17: Add disk-backed result-store persistence module — ✅ PASS
Covers AC-COMPACT-1 with a self-contained persistence module and tests.

### Task 18: Snapshot the result store to disk on every storeResult call site — ❌ REVISE
- Implementation text mentions all three call sites, but tests only cover `web_search`. AC-COMPACT-2 says every `storeResult(...)` invocation followed by `appendEntry(...)` must snapshot.

### Task 19: Rehydrate result store from disk on session_start — ❌ REVISE
- Does not prove AC-COMPACT-6 (“without relying on `ctx.sessionManager.getEntries()`); the test uses `getEntries: () => []`.
- Implementation calls disk rehydrate and then session replay, so disk is not clearly authoritative.

### Task 20: Delete the results disk file on session_shutdown — ❌ REVISE
- Missing dependency annotation on Task 7, because it changes the session handler signature/shape introduced there.

### Task 21: Prune stale results disk files (>24h) on session_start — ✅ PASS
Covers the stale-file half of AC-COMPACT-4.

### Task 22: Compaction regression test: get_search_content resolves pre-compaction responseId — ❌ REVISE
- Does not emit `session_before_compact` or `session_compact`, so it does not meet AC-COMPACT-5. It duplicates a session-start rehydrate test.

### Task 23: Bump package.json version to 4.1.0 — ✅ PASS
No-test metadata change is justified.

### Task 24: Add 4.1.0 changelog section to README — ✅ PASS
Documentation-only no-test task is justified and covers AC-BATCH-3.

### Task 25: Assert index.ts shrank vs the v4.0.0 baseline — ❌ REVISE
- Should explicitly cover AC-BATCH-1, which is otherwise unreferenced.
- Line-count helper should match `wc -l` semantics more closely.

### Missing Coverage
Mechanical grep of `spec.md` vs task files found no task references for: AC-BATCH-1, AC-LIFECYCLE-7, AC-PREPARE-3, AC-PREPARE-6.

### Verdict
revise — the plan has concrete coverage gaps, several tests that would be false positives due to `vi.resetModules()`, incomplete cancellation propagation to `filterContent`/`complete`, and a compaction regression test that does not simulate the specified events. See `revise-instructions-1.md` for prescriptive fixes.
