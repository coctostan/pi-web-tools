# Implement Task 6 — Call `clearUrlCache()` on session start

## Scope
Task 6 of 9 for issue `015-caching-cleanup`.

Implemented:
- Updated `index.ts` to import `clearUrlCache` from `./extract.js`.
- Updated `handleSessionStart` in `index.ts` to call `clearUrlCache()` alongside existing startup cleanup calls.
- Updated `index.test.ts` hoisted state + `vi.mock("./extract.js", ...)` to include `clearUrlCache` spy.
- Added session lifecycle test coverage:
  - helper `getSessionHandlers()`
  - test `calls clearUrlCache on session_start`

## TDD Log

### RED
Command:
- `npx vitest run index.test.ts`

Result:
- FAIL (expected):
  - `AssertionError: expected "spy" to be called at least once`
  - failing test: `session lifecycle > calls clearUrlCache on session_start`

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run index.test.ts`

Result:
- PASS (`index.test.ts`)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npm test`

Result:
- PASS — 13 test files, 167 tests

## Files Changed
- `index.test.ts`
- `index.ts`
