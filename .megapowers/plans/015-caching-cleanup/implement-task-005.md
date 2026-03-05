# Implement Task 5 — Export `clearUrlCache()` and verify cache clear behavior

## Scope
Task 5 of 9 for issue `015-caching-cleanup`.

Implemented:
- Exported `clearUrlCache()` from `extract.ts`:
  - function clears the module-level `urlCache` map
- Updated `extract.test.ts` import to include `clearUrlCache`
- Added RED/GREEN test:
  - `clearUrlCache() causes next call to make a fresh network request`

## TDD Log

### RED
Command:
- `npx vitest run extract.test.ts`

Result:
- Initial fail reason was wrong (fixture caused fallback and extra fetch). Increased fixture content to avoid fallback.
- Re-ran and got expected missing-implementation failure:
  - `TypeError: (0 , clearUrlCache) is not a function`

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
- PASS — 13 test files, 166 tests

## Files Changed
- `extract.test.ts`
- `extract.ts`
