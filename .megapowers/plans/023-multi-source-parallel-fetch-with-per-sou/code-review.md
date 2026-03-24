# Code Review

## Files Reviewed
- `index.ts` — Changed the multi-URL+prompt ptcValue construction (lines 635-690)
- `ptc-value.test.ts` — Replaced 1 test with 3 new tests covering success, error, and fallback shapes

## Strengths

- **Surgical scope** — Only the multi-URL+prompt ptcValue construction changed. All other paths untouched. (`index.ts:635-690`)
- **Clean per-branch shapes** — Each branch (success, error, fallback) pushes exactly the fields needed, no nulls. (`index.ts:640`, `651`, `662`)
- **Order-independent test assertions** — Error test uses `.find()` by URL instead of assuming array index order, correctly handling the parallel push race. (`ptc-value.test.ts:384-385`)
- **Exhaustive key assertions** — Tests use `Object.keys().sort()` to verify exact field sets, catching any accidental extras. (`ptc-value.test.ts:355`, `387`, `391`, `420`, `430`)
- **Existing tests preserved** — Single-URL and no-prompt tests still use `ptc.urls`, confirming AC 10.

## Findings

### Critical
None.

### Important
None.

### Minor

1. **`ptcSources` typed as `Record<string, unknown>` loses type safety** — `index.ts:635`. The old code had an explicit union type. Now any key/value can be pushed without compile-time checks. Not a bug (tests catch shape issues), but a typed discriminated union would be cleaner for maintainability.
   - **Impact:** Low — the array is constructed and consumed in ~50 lines of the same function. Tests exhaustively verify shapes.
   - **Suggestion:** Consider a discriminated union type in a future cleanup pass, e.g. `type PtcSource = { url: string; answer: string; contentLength: number } | { url: string; error: string } | { url: string; title: string; content: string; filePath: string | null; contentLength: number }`.

2. **Parallel push ordering** — `ptcSources.push()` inside parallel callbacks means array order depends on which promise resolves first. The error test handles this with `.find()`, but the success and fallback tests still use `ptc.sources[0]` / `ptc.sources[1]`. These work because the mocks resolve synchronously in order, but they're technically fragile.
   - **Impact:** Very low — vitest mocks are deterministic. Only matters if mock implementation changes.
   - **No action needed now.** If it ever becomes an issue, switch to `.find()` in all tests.

## Recommendations
None for this PR. The minor findings are note-for-later items.

## Assessment
**ready** — Clean, minimal change. All 222 tests pass. No bugs, no regressions, no architectural concerns.
