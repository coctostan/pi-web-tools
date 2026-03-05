---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 7
  - 8
  - 4
  - 5
  - 6
approved_tasks:
  - 1
  - 2
  - 3
  - 7
  - 8
needs_revision_tasks:
  - 4
  - 5
  - 6
---

### Task 1: retryFetch retries on retryable HTTP status codes with exponential backoff — ✅ PASS
Covers AC 1/2/5 with executable tests and a valid RED→GREEN path.

### Task 2: retryFetch retries on network errors (TypeError) — ✅ PASS
Covers AC 3 with concrete TypeError cases and correct retry logic shape.

### Task 3: retryFetch does not retry on non-retryable HTTP status codes — ✅ PASS
Covers AC 4 with explicit 400/401/403/404 behavior and status-branch implementation.

### Task 4: retryFetch respects AbortSignal (pre-aborted and mid-backoff) — ❌ REVISE
- **Dependency issue:** frontmatter says `depends_on: [1]`, but Step 3 function body references `RETRYABLE_STATUS_CODES` and network-error branches introduced later (Task 3 chain).
- **Step 2 not concrete enough:** expected failure is explanatory, not a specific assertion failure string.
- **Self-containment risk:** Step 3 replaces too much function body for a task that only needs early-abort logic.

### Task 5: searchExa uses retryFetch instead of raw fetch — ❌ REVISE
- **Regression risk (AC13):** existing `exa-search.test.ts` 429 error test uses `mockResolvedValueOnce(...)`. After retry integration, additional fetch calls occur; unconfigured calls return `undefined`, causing `TypeError: Cannot read properties of undefined (reading 'ok')` instead of preserving the 429-path assertion.
- Task steps need to explicitly account for this so Step 4/5 can actually pass.

### Task 6: searchContext uses retryFetch instead of raw fetch — ❌ REVISE
- **Dependency issue:** frontmatter says `depends_on: [1]`, but Step 1 includes network-error retry behavior that depends on Task 2 (and effective non-retryable behavior from Task 3 for existing 400 tests).
- Update dependency chain so this task is runnable with declared prerequisites.

### Task 7: Batch web_search executes queries concurrently via p-limit(3) — ✅ PASS
Covers AC 10/11 with correct tool API usage (`getWebSearchTool`, `execute(callId, params)`) and robust partial-failure assertions.

### Task 8: Multi-URL fetch_content uses p-limit(3) for bounded concurrency — ✅ PASS
Covers AC 12 with runnable test shape and implementation consistent with current `index.ts` fetch-content flow.

### Missing Coverage
- **AC13** is not explicitly tagged by any task and is currently at risk due Task 5 regression behavior. Step 5 "run full suite" exists, but Task 5 needs concrete handling to keep full-suite green.

Detailed, prescriptive edits were written to:
`.megapowers/plans/014-network-resilience-retry-parallel-batch/revise-instructions-2.md`
