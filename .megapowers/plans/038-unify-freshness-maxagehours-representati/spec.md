## Goal

Refactor web search freshness handling so `freshness` is the single canonical internal representation, Exa-specific `maxAgeHours` is derived only at the Exa request boundary, and existing public behavior remains unchanged except for clarifying README documentation.

## Acceptance Criteria

1. The `web_search` tool schema continues to expose `freshness` with exactly the public values `"realtime"`, `"day"`, `"week"`, and `"any"`.

2. No public `maxAgeHours` tool parameter is added.

3. `exa-search.ts` exports a `Freshness` type representing the canonical string values `"realtime"`, `"day"`, `"week"`, and `"any"`.

4. `exa-search.ts` exports one clearly named helper that maps `Freshness | undefined` to the Exa `maxAgeHours` request value.

5. `normalizeWebSearchInput` returns canonical `freshness` instead of converting freshness to `maxAgeHours`.

6. `normalizeWebSearchInput` preserves existing query validation errors: `similarUrl` remains mutually exclusive with `query`/`queries`, and a request without either query input or `similarUrl` still throws.

7. The Exa freshness mapping helper maps `"realtime"` to `1`, maps `"day"` to `24`, maps `"week"` to `168`, maps `"any"` to `undefined`, and maps omitted freshness to `undefined`.

8. `searchExa` derives and writes `maxAgeHours` into the `/search` request body only from canonical `freshness` at the Exa request boundary.

9. `searchExa` never sends `maxAgeHours: 0`.

10. `searchExa` omits `maxAgeHours` from the request body for `"any"` and for omitted freshness.

11. `findSimilarExa` does not send `maxAgeHours` to `/findSimilar`.

12. `findSimilarExa` does not send `category` to `/findSimilar`.

13. The `similarUrl` execution path in `index.ts` continues to emit a user-visible warning when `freshness` is provided and ignored.

14. `index.ts` passes canonical `freshness` through web search execution instead of passing normalized `maxAgeHours`.

15. Existing tests that assert `normalizeWebSearchInput` returns `maxAgeHours` are removed or rewritten to assert canonical `freshness` behavior.

16. Tests cover all four canonical freshness values and omitted freshness at the Exa request boundary.

17. Existing `exa-search.test.ts` coverage remains green.

18. README documentation clarifies that `freshness: "realtime"` means the last 1 hour, not `0h`.

19. Existing `searchExa` and `findSimilarExa` error behavior is preserved: missing API key errors, wrapped network errors, and non-OK Exa API errors continue to behave as before.

## Out of Scope

- Adding freshness values beyond `"realtime"`, `"day"`, `"week"`, and `"any"`.
- Adding a public `maxAgeHours` tool parameter.
- Changing `/findSimilar` endpoint capability handling beyond preserving unsupported-field omission and warning behavior.
- Changing search ranking, deduplication, query enhancement, result formatting, retry behavior, or response parsing.
- Creating a new shared `freshness.ts` module unless implementation discovers an unavoidable architectural need.
- Changing public tool behavior beyond README clarification.

## Open Questions

None.

## Requirement Traceability

- R1 -> AC 1
- R2 -> AC 1, AC 2
- R3 -> AC 3, AC 5, AC 8, AC 14
- R4 -> AC 3
- R5 -> AC 3
- R6 -> AC 4
- R7 -> AC 5, AC 8, AC 14
- R8 -> AC 4, AC 7
- R9 -> AC 7
- R10 -> AC 7
- R11 -> AC 7
- R12 -> AC 7, AC 10
- R13 -> AC 7, AC 10
- R14 -> AC 8
- R15 -> AC 11
- R16 -> AC 13
- R17 -> AC 5
- R18 -> AC 14
- R19 -> AC 18
- R20 -> AC 17
- R21 -> AC 16
- R22 -> AC 7, AC 9
- O1 -> AC 4
- O2 -> AC 15
- D1 -> Out of Scope
- D2 -> Out of Scope
- D3 -> Out of Scope
- D4 -> Out of Scope
- D5 -> Out of Scope
- C1 -> Out of Scope
- C2 -> AC 1, AC 2
- C3 -> AC 9
- C4 -> AC 10
- C5 -> AC 11, AC 12
- C6 -> AC 6
- C7 -> AC 19
- C8 -> Out of Scope
