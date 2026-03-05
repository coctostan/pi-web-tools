# Implement Task 9 — Convert sync fs usage in `github-extract.ts` to `fs.promises`

## Scope
Task 9 of 9 for issue `015-caching-cleanup`.

Implemented:
- Replaced all sync `node:fs` usage in `github-extract.ts` with async `node:fs/promises` APIs.
- Updated internals to async equivalents:
  - `isBinaryFile`, `buildTree`, `buildDirListing`, `readReadme`, `generateContent`, `execClone`, `cloneRepo`
- Updated cleanup to async `rm(...)` behavior in clone failure/finally paths.
- Kept `clearCloneCache()` sync signature but switched internals to fire-and-forget `rm(...).catch(...)`.
- Rewrote `github-extract.clone.test.ts` to mock `node:fs/promises` instead of `node:fs`.

## TDD Log

### RED
Command:
- `npx vitest run github-extract.clone.test.ts`

Result:
- FAIL (expected): cleanup assertions failed because old implementation still used sync fs methods (`state.rm` never called by implementation).
- Also observed content-throw mismatch before implementation conversion (old sync path behavior).

Signal:
- `megapowers_signal({ action: "tests_failed" })`

### GREEN
Command:
- `npx vitest run github-extract.clone.test.ts`

Result:
- PASS (`github-extract.clone.test.ts`)

Signal:
- `megapowers_signal({ action: "tests_passed" })`

### Regression Check
Command:
- `npm test`

Result:
- PASS — 13 test files, 167 tests

### Sync-fs guard check
Command:
- `grep -E 'existsSync|readFileSync|statSync|readdirSync|rmSync|openSync|readSync|closeSync' github-extract.ts`

Result:
- No output (expected)

## Files Changed
- `github-extract.clone.test.ts`
- `github-extract.ts`
