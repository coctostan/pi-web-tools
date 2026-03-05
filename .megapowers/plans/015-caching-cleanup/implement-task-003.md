# Implement Task 3 — Add URL cache to `extractContent`

## Scope
Task 3 of 9 for issue `015-caching-cleanup`.

Implemented:
- Added a module-level URL cache in `extract.ts`:
  - `interface UrlCacheEntry { result: ExtractedContent; fetchedAt: number }`
  - `const urlCache = new Map<string, UrlCacheEntry>()`
- Updated `extractContent` to:
  - return cached result when URL already exists in cache (no TTL check yet)
  - cache successful HTTP results (`error === null`)
  - cache successful Jina fallback results
  - continue avoiding caching of error results
- Added RED/GREEN test coverage in `extract.test.ts`:
  - `returns cached result for same URL — single network request (no TTL check yet)`

## TDD Log

### RED
Command:
- `npx vitest run extract.test.ts`

Result:
- FAIL as expected:
  - `expected "spy" to be called 1 times, but got 2 times`

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
- PASS — 13 test files, 164 tests

## Files Changed
- `extract.test.ts`
- `extract.ts`
