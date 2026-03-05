# Implement Task 6 — searchContext uses retryFetch instead of raw fetch

## Scope
Task 6 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Extended `exa-context.test.ts` with retry integration tests:
  - retries on 429 then succeeds
  - retries on retryable network error (`TypeError("fetch failed")`) then succeeds
- Updated `exa-context.ts`:
  - imported `retryFetch` from `./retry.js`
  - replaced raw `fetch(...)` with `retryFetch(...)` in `searchContext`

## TDD Log
### RED
Command:
- `npx vitest run exa-context.test.ts`

Result:
- FAIL as expected:
  - `Exa Context API error (429): rate limited`
  - `Context request failed for query "test query": fetch failed`

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run exa-context.test.ts`

Result:
- PASS (`exa-context.test.ts` 9 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 160 tests)

## Files Changed
- `exa-context.test.ts`
- `exa-context.ts`
