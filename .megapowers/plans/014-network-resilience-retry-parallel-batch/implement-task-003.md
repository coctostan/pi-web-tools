# Implement Task 3 — retryFetch does not retry on non-retryable HTTP status codes

## Scope
Task 3 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Extended `retry.test.ts` with non-retryable status tests for 400, 401, 403, 404.
- Updated `retry.ts` to classify status codes via:
  - `RETRYABLE_STATUS_CODES` = 429, 500, 502, 503, 504
  - `NON_RETRYABLE_STATUS_CODES` = 400, 401, 403, 404
- `retryFetch` now returns immediately for non-retryable statuses and retries only retryable statuses.

## TDD Log
### RED
Command:
- `npx vitest run retry.test.ts`

Result:
- FAIL as expected (new non-retryable tests failed; current implementation retried and waited under fake timers).

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run retry.test.ts`

Result:
- PASS (`retry.test.ts` 12 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 154 tests)

## Files Changed
- `retry.test.ts`
- `retry.ts`
