# Implement Task 1 — retryFetch retries on retryable HTTP status codes with exponential backoff

## Scope
Task 1 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Added `retry.test.ts` with Task 1 RED/GREEN coverage:
  - retries on 429 with exponential backoff (1s, 2s)
  - retries on 500/502/503/504
  - returns last error response after max retries
  - default config check (`maxRetries=2`, `initialDelayMs=1000`)
- Added `retry.ts` with minimal baseline implementation:
  - `RetryConfig` (`maxRetries`, `initialDelayMs`)
  - `delay(ms, signal?)` helper
  - `retryFetch(input, init, config)`
  - exponential backoff retry loop over non-OK responses
  - default retry config values

## TDD Log
### RED
Command:
- `npx vitest run retry.test.ts`

Result:
- FAIL as expected: `Cannot find module './retry.js'`

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run retry.test.ts`

Result:
- PASS (`retry.test.ts` 4 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 146 tests)

## Files Changed
- `retry.test.ts` (new)
- `retry.ts` (new)
