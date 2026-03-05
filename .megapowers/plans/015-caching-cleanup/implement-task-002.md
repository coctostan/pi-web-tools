# Implement Task 2 — Replace raw `30000` literals in `extract.ts`

## Scope
Task 2 of 9 for issue `015-caching-cleanup`.

Implemented:
- Added import in `extract.ts`:
  - `import { HTTP_FETCH_TIMEOUT_MS } from "./constants.js";`
- Replaced both timeout literals in `extractViaHttp` and `extractViaJina`:
  - `AbortSignal.timeout(30000)` → `AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS)`

## Verification

### Typecheck command from plan
Command:
- `npx tsc --noEmit`

Result:
- Fails with pre-existing TypeScript errors outside Task 2 scope (existing diagnostics in `index.ts` and missing `turndown` types).

### Literal check
Command:
- `grep '30000' extract.ts || true`

Result:
- No output (no raw `30000` remains in `extract.ts`).

### Full test suite
Command:
- `npm test`

Result:
- PASS — 13 test files, 163 tests.

## Files Changed
- `extract.ts`
