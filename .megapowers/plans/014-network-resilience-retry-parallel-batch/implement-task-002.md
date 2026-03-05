# Implement Task 2 — retryFetch retries on network errors (TypeError)

## Scope
Task 2 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Extended `retry.test.ts` with network-error retry coverage:
  - retries on `TypeError("fetch failed")`
  - retries on `TypeError("ECONNRESET")`
  - retries on `TypeError("ETIMEDOUT")`
  - throws after exhausting retries for retryable network errors
- Updated `retry.ts` to retry retryable `TypeError`s until `maxRetries` exhausted.

## Notes
- Adjusted one new test (`throws network error after exhausting retries`) to attach the rejection assertion immediately (`const rejection = expect(promise).rejects...`) to avoid Vitest unhandled-rejection false failure while preserving the same behavior check.

## TDD Log
### RED
Command:
- `npx vitest run retry.test.ts`

Result:
- FAIL as expected: retry assertions showed no retry on TypeError (called 1 time instead of 2/3)

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run retry.test.ts`

Result:
- PASS (`retry.test.ts` 8 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 150 tests)

## Files Changed
- `retry.test.ts`
- `retry.ts`
