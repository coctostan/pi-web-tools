# Learnings — Issue #020

- **`0` is a valid sentinel, not "falsy".** The `!== undefined` guard correctly allowed `maxAgeHours: 0` to pass through to Exa. The bug was in the map value itself, not the guard. Always double-check that "zero" for a numeric config isn't accidentally used as "disabled" when the API has a different meaning for zero.

- **API semantics require spec verification before writing tests.** The original BUG #019 tests assumed `maxAgeHours` and `category` should be forwarded to `/findSimilar` — but the Exa OpenAPI spec showed neither is in `CommonRequest`. Checking the spec first avoids writing tests that encode wrong behavior.

- **Copy-paste omissions have a pattern.** `findSimilarExa` was clearly copied from `searchExa` but the filter-appending block was omitted before `JSON.stringify`. When reviewing similar functions, always compare them side by side to catch omitted sections.

- **Pre-staged failing tests accelerate TDD.** Having the regression tests already in the file before the implement phase (from the plan/brainstorm phase) meant the RED step was just running the suite, not writing new code. This is a good planning pattern.

- **Warning notes are better than silent drops.** When an API endpoint doesn't support a parameter, a user-visible note ("Note: freshness is not supported for similarUrl searches") is far more useful than silently ignoring it. Prefer explicit degradation.

- **Two-layer bugs need two-layer fixes.** Bug #019 was dropped at both `exa-search.ts` (implementation never read the options) and `index.ts` (call site never passed them). Fixing only one layer would have left the bug in place. Always trace the full call chain.

- **Document API limitations in the tool schema, not just the README.** The `similarUrl` description now notes which params are/aren't supported. This surfaces at tool-call time in the LLM's context, reducing user confusion without requiring them to read docs.
