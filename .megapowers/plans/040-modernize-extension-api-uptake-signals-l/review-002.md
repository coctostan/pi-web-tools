---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 8
  - 9
  - 10
  - 11
  - 12
  - 13
  - 14
  - 16
  - 17
  - 18
  - 20
  - 21
  - 23
  - 24
  - 25
  - 6
  - 7
  - 15
  - 19
  - 22
approved_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 8
  - 9
  - 10
  - 11
  - 12
  - 13
  - 14
  - 16
  - 17
  - 18
  - 20
  - 21
  - 23
  - 24
  - 25
needs_revision_tasks:
  - 6
  - 7
  - 15
  - 19
  - 22
---

### Task 1: web_search: forward execute()'s signal directly to Exa calls — ✅ PASS
No issues.

### Task 2: fetch_content: forward execute()'s signal directly to extractors and filter completion — ✅ PASS
Revision addresses `filterContent` / `complete(...)` signal propagation with the real `filterContent` signature.

### Task 3: code_search: forward execute()'s signal directly to searchContext — ✅ PASS
No issues.

### Task 4: get_search_content: drop unused signal-wrapping plumbing — ✅ PASS
Now explicitly handles already-aborted signal and documents the no-downstream-fetch exception.

### Task 5: Remove pendingFetches Map and abortAllPending helper — ✅ PASS
No issues.

### Task 6: Per-tool in-flight cancellation regression tests — ❌ REVISE
- The `code_search` assertion is incompatible with the real implementation: `code_search.execute` catches `searchContext` errors and returns `{ isError: true }`; it does not reject.
- Step 2 still has an ambiguous/non-RED expectation: it says the task may already be green after Tasks 1–4, which is weak for a non-`[no-test]` TDD task.

### Task 7: handleSessionStart receives SessionStartEvent and routes by reason — ❌ REVISE
- AC-LIFECYCLE-7 requires assertions via spies/mocks for `clearResults`, `restoreFromSession`, and `restoreFromSessionFile`. The test only infers `clearResults` from store contents and infers restore through `getEntries`.
- The previous revision specifically requested observable spies/mocks for these functions; this is still not precise enough.

### Task 8: session_start "new" reason clears the in-memory result store — ✅ PASS
The module-instance issue is fixed by seeding storage after handler registration.

### Task 9: Add restoreFromSessionFile helper that reads parent session log — ✅ PASS
No issues.

### Task 10: session_start "fork" branch uses event.previousSessionFile — ✅ PASS
Uses `vi.doMock` before importing `index.ts`, so the spies are on the same module instance.

### Task 11: session_start "reload" preserves URL cache and temp files — ✅ PASS
No issues.

### Task 12: Adopt prepareArguments for web_search — ✅ PASS
No issues.

### Task 13: Adopt prepareArguments for fetch_content — ✅ PASS
No issues.

### Task 14: Adopt prepareArguments for code_search — ✅ PASS
No issues.

### Task 15: Adopt prepareArguments for get_search_content — ❌ REVISE
- Task 4 now requires the `signal` parameter and an early aborted-result branch, but Task 15 Step 3 still instructs the implementer to use `_signal` and only destructure params. This would overwrite/lose Task 4’s cancellation behavior when prepareArguments is adopted.

### Task 16: Tighten WebSearchParams.numResults and prepare-function return types — ✅ PASS
Now covers AC-PREPARE-3, AC-PREPARE-4, and AC-PREPARE-6.

### Task 17: Add disk-backed result-store persistence module — ✅ PASS
No issues.

### Task 18: Snapshot the result store to disk on every storeResult call site — ✅ PASS
Now tests all three observable call sites.

### Task 19: Rehydrate result store from disk on session_start — ❌ REVISE
- Step 1 test snippet has a syntax error: it closes the `it(...)` block but not the enclosing `describe(...)` block.
- Dependency metadata should include Task 18 because this task builds on the disk snapshot/test-dir convention introduced there.

### Task 20: Delete the results disk file on session_shutdown — ✅ PASS
Dependency annotation was corrected.

### Task 21: Prune stale results disk files (>24h) on session_start — ✅ PASS
No issues.

### Task 22: Compaction regression test: get_search_content resolves pre-compaction responseId — ❌ REVISE
- The regression is close, but it should assert after `session_compact` that the in-memory store has actually been rehydrated from disk (`storage.getResult(responseId) !== null`) before calling `get_search_content`.
- Step 3 should state the handlers depend on the module-scope `snapshotStore` and `rehydrateFromDisk` helpers being available before handler registration.

### Task 23: Bump package.json version to 4.1.0 — ✅ PASS
No issues.

### Task 24: Add 4.1.0 changelog section to README — ✅ PASS
No issues.

### Task 25: Assert index.ts shrank vs the v4.0.0 baseline — ✅ PASS
Now covers AC-BATCH-1 and uses `wc -l`-compatible counting.

### Missing Coverage
None. Mechanical AC identifier coverage check found no missing acceptance criteria.

### Verdict
revise — most revision issues are fixed, but Tasks 6, 7, 15, 19, and 22 still need precise corrections before implementation.
