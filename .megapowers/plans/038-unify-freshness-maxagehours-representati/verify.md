## Test Suite Results

Commands run fresh in verify phase:

```text
$ npm test

> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ scope-rescope.test.ts (3 tests) 6ms
 ✓ session-results-store.test.ts (6 tests) 7ms
 ✓ research-cache.test.ts (14 tests) 9ms
 ✓ retry.test.ts (14 tests) 10ms
 ✓ exa-context.test.ts (9 tests) 5ms
 ✓ config.test.ts (18 tests) 15ms
 ✓ exa-search.test.ts (37 tests) 37ms
 ✓ github-extract.clone.test.ts (4 tests) 76ms
 ✓ smart-search.test.ts (11 tests) 4ms
 ✓ smart-search.integration.test.ts (1 test) 320ms
 ✓ offload.test.ts (9 tests) 6ms
 ✓ storage.test.ts (8 tests) 7ms
 ✓ filter.test.ts (12 tests) 4ms
 ✓ tool-params.test.ts (36 tests) 4ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 3ms
 ✓ extract.test.ts (17 tests) 118ms
 ✓ truncation.test.ts (7 tests) 2ms
 ✓ github-extract.test.ts (9 tests) 2ms
 ✓ ptc-value.test.ts (16 tests) 591ms
 ✓ cli.search.test.ts (2 tests) 3ms
 ✓ cli.code.test.ts (2 tests) 3ms
 ✓ cli.fetch.raw.test.ts (2 tests) 3ms
 ✓ cli.usage.test.ts (2 tests) 1ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 2ms
 ✓ index.test.ts (69 tests) 834ms

 Test Files  25 passed (25)
      Tests  311 passed (311)
   Start at  18:12:32
   Duration  1.20s (transform 759ms, setup 0ms, collect 3.65s, tests 2.07s, environment 2ms, prepare 1.27s)
```

Targeted regression command:

```text
$ npx vitest run exa-search.test.ts tool-params.test.ts index.test.ts -t "freshness|similarUrl|error|missing API key|network|non-OK|maxAgeHours|category"

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ tool-params.test.ts (36 tests | 27 skipped) 3ms
 ✓ exa-search.test.ts (37 tests | 24 skipped) 6ms
 ✓ index.test.ts (69 tests | 60 skipped) 204ms

 Test Files  3 passed (3)
      Tests  31 passed | 111 skipped (142)
   Start at  18:13:11
   Duration  463ms (transform 179ms, setup 0ms, collect 195ms, tests 212ms, environment 0ms, prepare 104ms)
```

Build/typecheck command:

```text
$ npm run build
✓ Build successful (0 units compiled)
```

No `AGENTS.md` was present, so conventions were inferred from `package.json` scripts: `test = vitest run`, `build = tsc -p tsconfig.json ...`.

Impact analysis before relying on the suite:

```text
impact({ symbols: ["searchExa", "findSimilarExa", "normalizeWebSearchInput", "exaMaxAgeHoursForFreshness"], changeType: "behavior_change", maxDepth: 4 })
Trust: fresh
No dependents found — 'searchExa' is an entry point with no callers.
No dependents found — 'findSimilarExa' is an entry point with no callers.
No dependents found — 'normalizeWebSearchInput' is an entry point with no callers.
No dependents found for 'exaMaxAgeHoursForFreshness' within depth 4.
```

The surfaced entry-point tests ran in the full suite: `exa-search.test.ts`, `tool-params.test.ts`, and `index.test.ts` all passed.

Execution path trace from the changed Exa search entry point:

```text
trace({ entry: "searchExa", file: "exa-search.ts" })
Trust: fresh
mode: static (heuristic, no runtime evidence)
exa-search.ts  89:82a  searchExa  function [entry-point, untested]
exa-search.ts  12:96a  exaMaxAgeHoursForFreshness  function [leaf, untested]
exa-search.ts  56:a5b  parseExaResults  function [untested]
exa-search.ts  52:724  isRecord  function [leaf, untested]
retry.ts  30:c5c  retryFetch  function [untested]
retry.ts  9:540  delay  function [leaf, untested]
```

Bugfix symptom reproduction: the original representation bug was that freshness was normalized to Exa `maxAgeHours` before the Exa boundary and realtime documentation/behavior was ambiguous around `0h`. The focused regression tests now exercise the symptom directly: `realtime` produces `maxAgeHours: 1`, never `0`, `any`/omitted freshness omit `maxAgeHours`, normalized web-search input contains `freshness` and does not contain `maxAgeHours`, and similarUrl warns when freshness is ignored. The targeted command above passed all 31 matching tests.

## Per-Criterion Verification

### Criterion 1: The `web_search` tool schema continues to expose `freshness` with exactly the public values `"realtime"`, `"day"`, `"week"`, and `"any"`.
**Evidence:** `index.ts:126` defines the schema as `freshness: Type.Optional(Type.Union([Type.Literal("realtime"), Type.Literal("day"), Type.Literal("week"), Type.Literal("any")], ...))`. `index.ts:187-188` attaches `parameters: WebSearchParams` and `prepareArguments: (raw) => normalizeWebSearchInput(raw as any) as any` to the web search tool. The full suite and targeted command passed.
**Verdict:** pass.

### Criterion 2: No public `maxAgeHours` tool parameter is added.
**Evidence:** `index.ts:126` schema line lists `query`, `queries`, `numResults`, `type`, `category`, `includeDomains`, `excludeDomains`, `detail`, `freshness`, and `similarUrl`; it does not include `maxAgeHours`. `grep("maxAgeHours", "README.md")` returned `[0 matches in 0 files]`. Structural search for object properties with `maxAgeHours` returned no public schema matches: `ast_search({ pattern: "$F({ $$$, maxAgeHours: $V, $$$ })" })` -> `No matches found`.
**Verdict:** pass.

### Criterion 3: `exa-search.ts` exports a `Freshness` type representing canonical string values.
**Evidence:** `exa-search.ts:10` is `export type Freshness = "realtime" | "day" | "week" | "any";`.
**Verdict:** pass.

### Criterion 4: `exa-search.ts` exports one clearly named helper that maps `Freshness | undefined` to the Exa `maxAgeHours` request value.
**Evidence:** `symbol_graph` for `exaMaxAgeHoursForFreshness`:

```text
## exaMaxAgeHoursForFreshness (function)
exa-search.ts  12:96a
Signature
(freshness: Freshness | undefined) => number | undefined
Callers (1): searchExa
Source lines 12-24 define the switch mapping.
```

The source is `export function exaMaxAgeHoursForFreshness(freshness: Freshness | undefined): number | undefined` at `exa-search.ts:12`.
**Verdict:** pass.

### Criterion 5: `normalizeWebSearchInput` returns canonical `freshness` instead of converting freshness to `maxAgeHours`.
**Evidence:** `tool-params.ts:23` declares `freshness?: Freshness`; `tool-params.ts:101-105` validates `params.freshness` against `VALID_FRESHNESS_VALUES` and returns `{ ..., freshness, similarUrl }`. The test at `tool-params.test.ts:93-100` asserts realtime/day/week/any are preserved and `normalizeWebSearchInput({ query: "x", freshness: "day" })` does not have property `maxAgeHours`. Targeted tests passed.
**Verdict:** pass.

### Criterion 6: `normalizeWebSearchInput` preserves existing query validation errors.
**Evidence:** `tool-params.ts:67-71` throws when both query input and `similarUrl` are present and when neither query input nor `similarUrl` exists. Tests at `tool-params.test.ts:109-114` assert both validation errors. Targeted tests passed.
**Verdict:** pass.

### Criterion 7: The Exa freshness mapping helper maps realtime/day/week/any/omitted correctly.
**Evidence:** `exa-search.ts:13-22` maps `"realtime" -> 1`, `"day" -> 24`, `"week" -> 168`, and `"any"`/`undefined -> undefined`. Test `exa-search.test.ts:74-80` asserts all five cases. Targeted tests passed.
**Verdict:** pass.

### Criterion 8: `searchExa` derives and writes `maxAgeHours` into `/search` only from canonical `freshness` at the boundary.
**Evidence:** `exa-search.ts:125-127` computes `const maxAgeHours = exaMaxAgeHoursForFreshness(options.freshness);` and only then sets `requestBody.maxAgeHours = maxAgeHours`. Structural search `requestBody.maxAgeHours = $VALUE` found a single assignment at `exa-search.ts:127`. Trace from `searchExa` shows the helper is on the `searchExa` path. Targeted tests passed.
**Verdict:** pass.

### Criterion 9: `searchExa` never sends `maxAgeHours: 0`.
**Evidence:** The helper source `exa-search.ts:13-22` never returns `0`. Test `exa-search.test.ts:276-277` asserts each freshness-derived request body value equals the expected value and `not.toBe(0)`. Targeted tests passed.
**Verdict:** pass.

### Criterion 10: `searchExa` omits `maxAgeHours` for `"any"` and omitted freshness.
**Evidence:** `exa-search.ts:126-128` only sets the field when the helper return is not `undefined`; helper returns `undefined` for `"any"` and omitted freshness at `exa-search.ts:20-22`. Test `exa-search.test.ts:281-290` asserts both request bodies have `body.maxAgeHours` undefined. Targeted tests passed.
**Verdict:** pass.

### Criterion 11: `findSimilarExa` does not send `maxAgeHours` to `/findSimilar`.
**Evidence:** `findSimilarExa` request body at `exa-search.ts:174-186` includes `url`, `numResults`, `contents`, `includeDomains`, and `excludeDomains`; there is no `maxAgeHours` assignment in the function. Test `exa-search.test.ts:541-551` calls `findSimilarExa(..., { freshness: "day" })` and asserts `body.maxAgeHours` is undefined. Targeted tests passed.
**Verdict:** pass.

### Criterion 12: `findSimilarExa` does not send `category` to `/findSimilar`.
**Evidence:** `findSimilarExa` request body at `exa-search.ts:174-186` does not include `category`. Test `exa-search.test.ts:580-590` calls `findSimilarExa(..., { category: "news" })` and asserts `body.category` is undefined. Targeted tests passed.
**Verdict:** pass.

### Criterion 13: The `similarUrl` execution path continues to emit a warning when `freshness` is provided and ignored.
**Evidence:** `index.ts:197-205` enters similarUrl mode, pushes `"freshness"` into `unsupportedFilters` when `freshness !== undefined`, and builds a warning note. Test `index.test.ts:1097-1108` executes the web search tool with `similarUrl` and `freshness: "day"`, then asserts text matches `/freshness.*not supported/i`. Targeted tests passed.
**Verdict:** pass.

### Criterion 14: `index.ts` passes canonical `freshness` through web search execution instead of normalized `maxAgeHours`.
**Evidence:** `index.ts:191` destructures `freshness` from prepared params. `index.ts:263-273` passes `freshness` to `searchExa`; no `maxAgeHours` is passed there. `tool-params.ts:101-105` returns canonical freshness. Targeted tests passed.
**Verdict:** pass.

### Criterion 15: Existing tests that assert `normalizeWebSearchInput` returns `maxAgeHours` are removed or rewritten.
**Evidence:** `tool-params.test.ts:93-100` now asserts canonical `freshness` and explicitly asserts the result does not have `maxAgeHours`. `grep("maxAgeHours", "tool-params.test.ts")` only finds the test title and the negative `not.toHaveProperty("maxAgeHours")` assertion. Targeted tests passed.
**Verdict:** pass.

### Criterion 16: Tests cover all four canonical freshness values and omitted freshness at the Exa request boundary.
**Evidence:** Exa boundary tests at `exa-search.test.ts:260-290` cover `"realtime"`, `"day"`, `"week"`, `"any"`, and omitted freshness in `searchExa` request bodies. Targeted tests passed.
**Verdict:** pass.

### Criterion 17: Existing `exa-search.test.ts` coverage remains green.
**Evidence:** Full suite output includes `✓ exa-search.test.ts (37 tests) 37ms`; targeted command includes `✓ exa-search.test.ts (37 tests | 24 skipped) 6ms`.
**Verdict:** pass.

### Criterion 18: README documentation clarifies `freshness: "realtime"` means last 1 hour, not `0h`.
**Evidence:** `README.md:190` documents `| freshness | string | "realtime" (last 1 hour), "day" (24h), "week" (168h), or "any" (no freshness filter) |`.
**Verdict:** pass.

### Criterion 19: Existing `searchExa` and `findSimilarExa` error behavior is preserved.
**Evidence:** Source still throws missing API key errors at `exa-search.ts:90-93` and `exa-search.ts:160-163`, wraps network errors at `exa-search.ts:143-145` and `exa-search.ts:201-203`, and throws non-OK Exa API errors at `exa-search.ts:148-152` and `exa-search.ts:206-210`. Tests cover these paths: `exa-search.test.ts:68-71` for `searchExa` missing key, `exa-search.test.ts:126-142` for `searchExa` API error, `exa-search.test.ts:435-440` for `searchExa` network error, and `exa-search.test.ts:594-622` for `findSimilarExa` missing key/network/non-OK errors. Targeted tests passed.
**Verdict:** pass.

## Overall Verdict

pass

All 19 acceptance criteria are verified with fresh test output, build/typecheck output, source inspection, structural search, impact analysis, and execution-path trace evidence. The implementation keeps `freshness` as the canonical internal representation, derives Exa `maxAgeHours` only at the `/search` request boundary, preserves `/findSimilar` unsupported-field behavior and warnings, and updates README documentation for realtime freshness.
