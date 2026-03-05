# Implement Task 1 — Create `constants.ts` with timeout and cache TTL constants

## Scope
Task 1 of 9 for issue `015-caching-cleanup`.

Implemented:
- Created `constants.ts` at repository root.
- Added:
  - `HTTP_FETCH_TIMEOUT_MS = 30_000`
  - `URL_CACHE_TTL_MS = 30 * 60 * 1_000` (30 minutes)

## Verification

### Typecheck command from plan
Command:
- `npx tsc --noEmit`

Result:
- Fails with pre-existing TypeScript errors outside this task scope (existing diagnostics in `extract.ts` and `index.ts`).

### Value verification
Command:
- `npx tsc constants.ts --target es2022 --module esnext --moduleResolution bundler --outDir /tmp/pi-web-tools-constants-check`
- `node -e "import('file:///tmp/pi-web-tools-constants-check/constants.js').then(m => { console.log('HTTP_FETCH_TIMEOUT_MS=' + m.HTTP_FETCH_TIMEOUT_MS); console.log('URL_CACHE_TTL_MS=' + m.URL_CACHE_TTL_MS); })"`

Result:
- `HTTP_FETCH_TIMEOUT_MS=30000`
- `URL_CACHE_TTL_MS=1800000`

### Full test suite
Command:
- `npm test`

Result:
- PASS — 13 test files, 163 tests

## Files Changed
- `constants.ts` (new)
