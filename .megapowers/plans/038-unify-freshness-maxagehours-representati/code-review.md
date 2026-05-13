## Files Reviewed

- `exa-search.ts` — adds canonical `Freshness`, exports `exaMaxAgeHoursForFreshness`, derives `maxAgeHours` at the `/search` request boundary, and keeps `/findSimilar` unsupported fields out of the request body.
- `exa-search.test.ts` — covers helper mapping, `/search` freshness-derived `maxAgeHours`, `any`/omitted freshness omission, and `/findSimilar` omission behavior.
- `tool-params.ts` — normalizes web-search freshness as canonical `Freshness` instead of Exa-specific `maxAgeHours`.
- `tool-params.test.ts` — rewrites freshness normalization assertions to canonical freshness and keeps validation tests.
- `index.ts` — passes canonical `freshness` through web search execution, preserves similarUrl unsupported-filter warnings, and updates public schema description for realtime freshness.
- `index.test.ts` — covers tool-schema realtime documentation, similarUrl warning behavior for meaningful freshness filters, and no warning for `freshness: "any"`.
- `README.md` — clarifies public `freshness` values and documents realtime as last 1 hour.
- `.megapowers/plans/038-unify-freshness-maxagehours-representati/verify.md` — verification artifact reviewed as context.

## Review Inputs

- Ran `codex_review({ base: "main", focus: "Review freshness/maxAgeHours refactor for correctness, public API compatibility, and test quality." })` early.
- Ran `codex_adversarial_review({ base: "main", focus: "Public web_search API surface and Exa boundary representation: look for schema/documentation drift, backward compatibility risks, and misleading warnings." })` because this touches public tool API/schema behavior.
- Ran `impact({ symbols: ["searchExa", "findSimilarExa", "normalizeWebSearchInput", "exaMaxAgeHoursForFreshness"], changeType: "signature_change", maxDepth: 4 })`; it reported no dependents for these entry points within depth 4.
- Reviewed `git diff -- exa-search.ts exa-search.test.ts tool-params.ts tool-params.test.ts index.ts index.test.ts README.md`.
- Used `symbol_graph` with contract/source for `searchExa`, `findSimilarExa`, and `normalizeWebSearchInput`.

Advisory findings handled:

- Adopted: `index.ts:126` schema description still documented `"realtime" (0h)`. Fixed to `"realtime" (last 1 hour)` and added `index.test.ts:437-444`.
- Adopted: `index.ts:200` warned for `similarUrl + freshness: "any"`, which is misleading because `"any"` is no freshness filter. Fixed to warn only when `freshness !== undefined && freshness !== "any"`, and added `index.test.ts:1120-1131`.
- Rejected: follow-up Codex finding that `exa-search.ts:26` should keep deprecated `maxAgeHours?: number` in exported `ExaSearchOptions`. Reason: the accepted plan explicitly removes `maxAgeHours?: number` in Task 3 to enforce canonical freshness as the single internal representation, `impact` surfaced no in-repo dependents, and AC 2/5/8/14 are specifically about preventing public/internal pass-through of Exa-specific `maxAgeHours` except at the boundary. Keeping a fallback would preserve the old internal representation path and weaken the intended migration. This is an intentional internal TypeScript API break, not a public tool parameter change.

## Strengths

- `exa-search.ts:10-24` keeps freshness mapping small, explicit, and named (`Freshness`, `exaMaxAgeHoursForFreshness`), making the Exa-specific conversion easy to audit.
- `exa-search.ts:125-127` derives `requestBody.maxAgeHours` only after entering `searchExa`, so Exa-specific representation stays at the request boundary.
- `exa-search.ts:174-186` keeps `findSimilarExa` request construction limited to supported fields; it does not accidentally forward `maxAgeHours` or `category`.
- `tool-params.ts:101-105` validates and returns canonical freshness without carrying Exa-specific state through normalized input.
- `index.ts:197-205` preserves user-visible warnings for unsupported similarUrl filters, and now avoids warning for the default-equivalent `freshness: "any"`.
- Test coverage is meaningful: `exa-search.test.ts:260-290` checks real request-body output for realtime/day/week/any/omitted freshness, `tool-params.test.ts:93-100` checks canonical normalization, and `index.test.ts:1106-1131` checks similarUrl warning behavior.
- Public documentation is aligned across README and schema: `README.md:190` and `index.ts:126` both describe realtime as last 1 hour.

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## Recommendations

- If `ExaSearchOptions` is consumed outside this package in the future, document its internal status or add a migration note in release notes explaining that callers should pass `freshness` instead of `maxAgeHours`.
- Consider a future readability-only cleanup for the large one-line TypeBox schemas in `index.ts`; this change did not introduce that style, and it is not necessary for this issue.

## Validation After Review Fixes

Focused tests added during code review:

```text
$ npx vitest run index.test.ts -t "schema documents realtime|freshness any"

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ index.test.ts (71 tests | 69 skipped) 210ms

 Test Files  1 passed (1)
      Tests  2 passed | 69 skipped (71)
   Start at  18:24:36
   Duration  483ms (transform 79ms, setup 0ms, collect 65ms, tests 210ms, environment 0ms, prepare 40ms)
```

Full test suite after review fixes:

```text
$ npm test

> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ scope-rescope.test.ts (3 tests) 6ms
 ✓ offload.test.ts (9 tests) 7ms
 ✓ research-cache.test.ts (14 tests) 9ms
 ✓ config.test.ts (18 tests) 12ms
 ✓ github-extract.clone.test.ts (4 tests) 31ms
 ✓ exa-search.test.ts (37 tests) 11ms
 ✓ storage.test.ts (8 tests) 4ms
 ✓ retry.test.ts (14 tests) 20ms
 ✓ session-results-store.test.ts (6 tests) 11ms
 ✓ tool-params.test.ts (36 tests) 4ms
 ✓ smart-search.integration.test.ts (1 test) 282ms
 ✓ smart-search.test.ts (11 tests) 5ms
 ✓ exa-context.test.ts (9 tests) 6ms
 ✓ filter.test.ts (12 tests) 9ms
 ✓ ptc-value.test.ts (16 tests) 545ms
 ✓ github-extract.test.ts (9 tests) 2ms
 ✓ truncation.test.ts (7 tests) 2ms
 ✓ cli.fetch.raw.test.ts (2 tests) 5ms
 ✓ extract.test.ts (17 tests) 176ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 3ms
 ✓ cli.code.test.ts (2 tests) 25ms
 ✓ cli.search.test.ts (2 tests) 35ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 8ms
 ✓ cli.usage.test.ts (2 tests) 2ms
 ✓ index.test.ts (71 tests) 954ms

 Test Files  25 passed (25)
      Tests  313 passed (313)
   Start at  18:24:39
   Duration  1.31s (transform 645ms, setup 0ms, collect 4.06s, tests 2.17s, environment 2ms, prepare 1.43s)
```

Build after review fixes:

```text
$ npm run build
✓ Build successful (0 units compiled)
```

Follow-up Codex review after fixes reported only the intentionally rejected `ExaSearchOptions.maxAgeHours` compatibility concern described above.

## Assessment

ready

The code is clear, focused, covered by targeted and full-suite tests, and aligned with the spec's canonical freshness design. Advisory review findings that represented real correctness/documentation issues were fixed and revalidated. The remaining advisory compatibility concern is an intentional internal API migration called for by the plan and not a blocker for this issue.
