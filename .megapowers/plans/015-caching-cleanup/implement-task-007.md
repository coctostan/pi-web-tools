# Implement Task 7 — Remove `sessionActive` dead variable from `index.ts`

## Scope
Task 7 of 9 for issue `015-caching-cleanup`.

Implemented:
- Removed module-level dead variable declaration:
  - `let sessionActive = false;`
- Removed no-op assignment in `handleSessionStart`:
  - `sessionActive = true;`
- Removed no-op assignment in `handleSessionShutdown`:
  - `sessionActive = false;`

## Verification

### Typecheck command from plan
Command:
- `npx tsc --noEmit`

Result:
- Fails with pre-existing TypeScript errors outside this task scope (same existing diagnostics in `extract.ts`/`index.ts` seen in earlier tasks).

### Dead reference check
Command:
- `grep "sessionActive" index.ts`

Result:
- No matches.

### Full test suite
Command:
- `npm test`

Result:
- PASS — 13 test files, 167 tests

## Files Changed
- `index.ts`
