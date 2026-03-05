# Implement Task 4 — retryFetch respects AbortSignal (pre-aborted and mid-backoff)

## Scope
Task 4 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Extended `retry.test.ts` with AbortSignal coverage:
  - throws immediately when signal is already aborted
  - aborts during backoff delay and does not issue retry request
- Updated `retry.ts` with early-abort guard in `retryFetch`:
  - before the attempt loop, if `signal.aborted` then throw abort error immediately.

## Notes
- Updated the new mid-backoff abort test to attach the rejection assertion before calling `controller.abort()` to avoid Vitest unhandled-rejection false failures while preserving behavior validation.

## TDD Log
### RED
Command:
- `npx vitest run retry.test.ts`

Result:
- FAIL as expected: pre-aborted signal test showed `fetch` was called once.

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run retry.test.ts`

Result:
- PASS (`retry.test.ts` 14 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 156 tests)

## Files Changed
- `retry.test.ts`
- `retry.ts`
