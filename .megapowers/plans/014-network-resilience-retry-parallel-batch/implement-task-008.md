# Implement Task 8 — Multi-URL fetch_content uses p-limit(3) for bounded concurrency

## Scope
Task 8 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Extended `index.test.ts` (`fetch_content file-first storage`) with:
  - a multi-URL raw-fetch test asserting `pLimit(3)` is used
  - assertions for observed concurrency value and `extractContent` call count
- Updated `index.ts` (multi-URL `fetch_content` branch):
  - replaced unbounded `Promise.all(dedupedUrls.map(fetchOne))`
  - with bounded concurrency via `pLimit(3)`

## TDD Log
### RED
Command:
- `npx vitest run index.test.ts`

Result:
- FAIL as expected:
  - `expected "spy" to be called with arguments: [ 3 ]`
  - calls observed for `pLimit` were `0`

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run index.test.ts`

Result:
- PASS (`index.test.ts` 16 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 163 tests)

## Files Changed
- `index.test.ts`
- `index.ts`
