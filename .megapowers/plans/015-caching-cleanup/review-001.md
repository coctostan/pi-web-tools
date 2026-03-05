---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 7
  - 8
  - 9
  - 5
  - 6
approved_tasks:
  - 1
  - 2
  - 3
  - 4
  - 7
  - 8
  - 9
needs_revision_tasks:
  - 5
  - 6
---

### Task 1: Create constants.ts with HTTP_FETCH_TIMEOUT_MS and URL_CACHE_TTL_MS — ✅ PASS
No issues.

### Task 2: Replace raw 30000 literals in extract.ts with HTTP_FETCH_TIMEOUT_MS — ✅ PASS
No issues.

### Task 3: Add URL cache to extractContent — same URL within session returns cached result — ✅ PASS
No issues.

### Task 4: Add TTL expiry to URL cache — stale entries cause fresh network request — ✅ PASS
No issues.

### Task 5: Export clearUrlCache() from extract.ts and verify it clears the cache — ❌ REVISE
- **Step 2 expected failure mode is incorrect for this repo’s runner.** `npx vitest run extract.test.ts` does not run TypeScript type-checking, so it won’t fail with `TS2305`.
- With the new named import added before implementation, failure will be a **module export error** (`does not provide an export named 'clearUrlCache'` / `No matching export`), not a TS compiler diagnostic.

### Task 6: Call clearUrlCache() in onSessionStart in index.ts — ❌ REVISE
- **Step 1 test invokes session_start handler with an invalid context**: `await handler({}, {})`.
- In the real code, `handleSessionStart` calls `restoreFromSession(ctx)`, and `restoreFromSession` requires `ctx.sessionManager.getEntries()`.
- As written, the test will fail with a `TypeError` before reaching the `clearUrlCache` assertion, so Step 2’s expected failure (`spy not called`) is not reliable.
- Provide a stub context with `sessionManager.getEntries(): []` in the test.

### Task 7: Remove sessionActive dead variable from index.ts — ✅ PASS
No issues.

### Task 8: Delete todo.md from the repository root — ✅ PASS
No issues.

### Task 9: Convert all sync fs operations in github-extract.ts to fs.promises — ✅ PASS
No issues.

### Missing Coverage
None. All AC 1–14 are covered by at least one task.

### Verdict
revise
