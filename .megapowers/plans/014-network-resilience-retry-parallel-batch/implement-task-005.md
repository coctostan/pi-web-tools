# Implement Task 5 — searchExa uses retryFetch instead of raw fetch

## Scope
Task 5 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Updated `exa-search.test.ts` for retry integration coverage:
  - made the existing 429 error fixture retry-safe using `mockResolvedValue(...)`
  - added `retry integration` tests for 429→success and 503→success
- Updated `exa-search.ts`:
  - imported `retryFetch` from `./retry.js`
  - replaced raw `fetch(...)` with `retryFetch(...)` in `searchExa`

## TDD Log
### RED
Command:
- `npx vitest run exa-search.test.ts`

Result:
- FAIL as expected in new retry tests:
  - `Exa API error (429): rate limited`
  - `Exa API error (503): service unavailable`

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run exa-search.test.ts`

Result:
- PASS (`exa-search.test.ts` 24 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 158 tests)

## Files Changed
- `exa-search.test.ts`
- `exa-search.ts`
