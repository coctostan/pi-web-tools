# Implement Task 7 — Batch web_search executes queries concurrently via p-limit(3)

## Scope
Task 7 of 8 for issue `014-network-resilience-retry-parallel-batch`.

Implemented:
- Extended `index.test.ts` (`web_search detail passthrough`) with:
  - batch query concurrency test asserting `pLimit(3)` is used and 3 queries execute
  - partial-failure test asserting one failing query is reported while others still succeed
- Updated `index.ts` (`web_search` tool execute path):
  - replaced sequential `for` loop with bounded concurrency via `pLimit(3)`
  - executes all query tasks with `Promise.all` and preserves per-query error reporting

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
- PASS (`index.test.ts` 15 tests)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npx vitest run`

Result:
- PASS (13 files, 162 tests)

## Files Changed
- `index.test.ts`
- `index.ts`
