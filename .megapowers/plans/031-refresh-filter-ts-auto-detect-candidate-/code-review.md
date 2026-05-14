## Files Reviewed

- `filter.ts` — updated auto-detect candidate order and exported `AUTO_DETECT_MODELS` plus `getFilterModelKeys` for shared cache-key usage (`filter.ts:21-29`).
- `filter.test.ts` — refreshed `resolveFilterModel` and `filterContent` contract tests for candidate fallback order, auth/header behavior, and signal forwarding.
- `README.md` — updated full config example filter model to `anthropic-cc/claude-haiku-4-5` (`README.md:333-336`).
- `index.ts` — updated prompt-cache lookups to use the same configured/auto-detect model key order as filtering (`index.ts:472-475`, `index.ts:663-665`).
- `research-cache.ts` — added `getCachedForModels` for one logical multi-model cache lookup without inflating hit/miss counters (`research-cache.ts:155-176`).
- `index.test.ts` — added/updated cache integration coverage for the new default candidate order (`index.test.ts:1181-1238`).
- `research-cache.test.ts` — added hit/miss counter coverage for `getCachedForModels` (`research-cache.test.ts:184-195`).
- `ptc-value.test.ts` — updated the research-cache mock surface for the new helper (`ptc-value.test.ts:102-105`).

## Advisory Review Input

Ran `codex_review(base: main)` early.

Adopted findings:
- Initial review found stale prompt-cache lookup keys in `index.ts` still using `anthropic/claude-haiku-4-5`. Fixed by routing cache lookup through `getFilterModelKeys(config.filterModel)` and `getCachedForModels` at `index.ts:475` and `index.ts:665`.
- Follow-up review found that looping over `getCached` once per candidate would inflate cache miss stats. Fixed by adding `getCachedForModels` (`research-cache.ts:155-176`) and tests proving one hit/miss is counted for a multi-model lookup (`research-cache.test.ts:184-195`).

Rejected findings:
- Initial review warned that `anthropic-cc/claude-haiku-4-5` may not exist in the installed model registry. I did not change this because the issue spec explicitly requires `anthropic-cc/claude-haiku-4-5` as the first candidate and out-of-scope says not to add provider integrations. The configured-model path remains unrestricted and failure/fallback behavior is covered.
- Follow-up review noted duplicated candidate strings in test mocks. I left the `filter.test.ts` candidate table independent of production `AUTO_DETECT_MODELS` so it can catch accidental production candidate drift; mocked integration tests need explicit strings because `./filter.js` is mocked there.

Final `codex_review(base: main)` result: no actionable correctness or regression findings.

## Strengths

- The production candidate order is concise and explicit: `filter.ts:21-25` contains exactly the three requested candidates.
- Configured-model behavior remains isolated from auto-detection: `resolveFilterModel(registry: ModelRegistry, configuredModel?: string): Promise<FilterModelResult>` parses and resolves configured values before the auto-detect loop (`filter.ts:60-72`).
- The cache-key fix keeps fetch prompt caching aligned with actual filter resolution order instead of hard-coding a stale model (`index.ts:475`, `index.ts:665`).
- `getCachedForModels(url: string, prompt: string, models: readonly string[], _ttlMinutes: number, cacheFilePath: string): string | null` avoids stats inflation by loading once, returning on the first valid candidate hit, and incrementing exactly one hit or miss (`research-cache.ts:155-176`).
- Tests cover both behavior and regression risk: focused filter fallback tests, fetch cache candidate ordering tests, and cache counter tests are all present (`filter.test.ts`, `index.test.ts:1181-1238`, `research-cache.test.ts:184-195`).

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## Recommendations

- If model-provider availability changes frequently, consider a future central model-catalog test that exercises the real installed `ModelRegistry` separately from this unit-level contract. That is outside this issue because the spec fixes the candidate strings and excludes provider integration work.
- If more modules need filter model keys, keep using `getFilterModelKeys` rather than duplicating configured/default model key logic.

## Breaking-Change / Surface Review

`impact(changeType: "signature_change")` results:

```text
No dependents found for 'resolveFilterModel' within depth 5.
No dependents found — 'filterContent' is an entry point with no callers.
No dependents found — 'getFilterModelKeys' is an entry point with no callers.
No dependents found — 'getCachedForModels' is an entry point with no callers.
```

No existing public signatures were changed. New exports are additive and used internally by `index.ts`.

## Verification After Review Fixes

Focused run:

```text
$ npx vitest run index.test.ts filter.test.ts ptc-value.test.ts research-cache.test.ts

 Test Files  4 passed (4)
      Tests  139 passed (139)
```

Full suite:

```text
$ npm test

 Test Files  27 passed (27)
      Tests  352 passed (352)
```

Build:

```text
$ npm run build
✓ Build successful (0 units compiled)
```

## Assessment

ready

The implementation satisfies the spec, fixes the cache-key regression found during review, preserves cache stats semantics, and passes the focused tests, full suite, and build. No remaining critical, important, or minor findings.