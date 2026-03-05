# Implement Task 4 — Add TTL expiry to URL cache

## Scope
Task 4 of 9 for issue `015-caching-cleanup`.

Implemented:
- Updated `extract.ts` import to include `URL_CACHE_TTL_MS`.
- Updated cache lookup in `extractContent` to enforce TTL:
  - cache hit only when `Date.now() - cached.fetchedAt < URL_CACHE_TTL_MS`
- Updated test setup in `extract.test.ts`:
  - `afterEach` now calls `vi.restoreAllMocks()`
- Added RED/GREEN test:
  - `treats cached entry as stale after URL_CACHE_TTL_MS has elapsed`

## TDD Log

### RED
Command:
- `npx vitest run extract.test.ts`

Result:
- Initial fail reason was wrong (fallback causing 2 fetches on first request). Adjusted TTL test fixture content length to avoid fallback.
- Re-ran and got expected fail:
  - `expected "spy" to be called 2 times, but got 1 times`

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run extract.test.ts`

Result:
- PASS (`extract.test.ts`)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npm test`

Result:
- PASS — 13 test files, 165 tests

## Files Changed
- `extract.test.ts`
- `extract.ts`
