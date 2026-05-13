## Goal

Unify web search freshness handling so the codebase has one canonical internal representation, while preserving the existing tool-facing `freshness` API and the current Exa request behavior. The outcome should be a pure refactor that makes freshness behavior easier to reason about and harder to regress.

## Mode

Direct requirements

The issue already defines the problem, acceptance criteria, likely files, and non-goal of avoiding feature changes. The main need is to capture the requirements clearly before specification.

## Must-Have Requirements

R1. The external `web_search` tool schema must continue to expose `freshness` with the values `"realtime"`, `"day"`, `"week"`, and `"any"`.

R2. There must be no external/tool-facing schema change for users or LLM callers.

R3. The codebase must use one canonical internal freshness representation instead of carrying both `freshness` and `maxAgeHours` through normal internal flow.

R4. The canonical internal representation must be the `Freshness` string value.

R5. `exa-search.ts` must own and export the `Freshness` type.

R6. `exa-search.ts` must own and export the freshness-to-Exa mapping helper.

R7. `maxAgeHours` must become a derived Exa request value rather than a normalized internal search option passed around from `tool-params.ts`.

R8. The freshness-to-Exa mapping must be centralized in a single function or equivalent single source of truth.

R9. The centralized mapping must preserve the current documented behavior: `"realtime"` maps to Exa `maxAgeHours: 1`.

R10. The centralized mapping must preserve the current documented behavior: `"day"` maps to Exa `maxAgeHours: 24`.

R11. The centralized mapping must preserve the current documented behavior: `"week"` maps to Exa `maxAgeHours: 168`.

R12. The centralized mapping must preserve the current documented behavior: `"any"` omits `maxAgeHours` from the Exa request.

R13. Omitting `freshness` must continue to omit `maxAgeHours` from the Exa request.

R14. The regular `searchExa` path must apply freshness at the Exa-call boundary.

R15. The `similarUrl` / `findSimilarExa` path must continue not to send `maxAgeHours` to Exa, because `/findSimilar` does not support it.

R16. The `similarUrl` path must continue warning users when `freshness` is provided and ignored.

R17. `tool-params.ts` must stop converting `freshness` into `maxAgeHours` during normalization.

R18. `index.ts` call sites must be adjusted to pass the canonical freshness representation instead of `maxAgeHours`.

R19. `README.md` must be updated so documentation clarifies that `"realtime"` means the last 1 hour, not `0h`.

R20. Existing `exa-search.test.ts` coverage must stay green.

R21. A test must assert that all four canonical freshness values produce the documented Exa request shapes.

R22. Existing bugfix intent from issues #018/#019/#020 must be preserved, especially that `realtime` must not map to `0`.

## Optional / Nice-to-Have

O1. Name the mapping helper clearly, such as `exaMaxAgeHoursForFreshness`, `applyFreshnessToExaRequest`, or equivalent.

O2. Remove or rewrite tests that assert `normalizeWebSearchInput` returns `maxAgeHours`, replacing them with tests for canonical freshness normalization and Exa-boundary mapping.

## Explicitly Deferred

D1. Adding new freshness values beyond `"realtime"`, `"day"`, `"week"`, and `"any"` is deferred.

D2. Changing Exa endpoint capability handling for `/findSimilar` is deferred.

D3. Changing search ranking, deduplication, query enhancement, or result formatting is deferred.

D4. Adding a new public `maxAgeHours` tool parameter is deferred.

D5. Creating a new shared `freshness.ts` module is deferred unless the spec phase uncovers a strong architectural reason.

## Constraints

C1. This is a pure refactor; there should be no intended feature change except documentation clarification.

C2. Public tool behavior must remain backward compatible.

C3. Exa must never receive `maxAgeHours: 0` for `"realtime"`.

C4. Exa must not receive `maxAgeHours` at all for `"any"` or omitted freshness.

C5. `/findSimilar` must not receive unsupported `maxAgeHours` or `category` fields.

C6. Existing error behavior for missing query/similarUrl and mutually exclusive query/similarUrl must be preserved.

C7. Existing Exa API key and request error behavior must be preserved.

C8. The refactor should remain small and avoid speculative abstractions.

## Open Questions

None.

## Recommended Direction

Use `freshness` as the canonical internal representation because it matches the external API, is easier to understand in tests and call sites, and avoids leaking Exa-specific `maxAgeHours` into unrelated layers. `normalizeWebSearchInput` should validate/pass through the freshness string rather than converting it.

Let `exa-search.ts` own and export both the `Freshness` type and the mapping helper. This keeps Exa-specific request-shape decisions close to the Exa request builder, while still giving `tool-params.ts` and `index.ts` a shared type when needed.

Keep `/findSimilar` behavior intentionally separate: it may accept the same options type for convenience, but it should not forward unsupported freshness-derived fields. `index.ts` should still detect provided freshness for `similarUrl` and emit the existing warning note.

Update README wording in this issue because it is small, directly related, and prevents the historical `0h` confusion from reappearing. Tests should no longer expect `normalizeWebSearchInput` to produce `maxAgeHours`; they should expect it to preserve canonical freshness. Exa request-body tests should prove the four public freshness values map to exactly the expected Exa shapes.

## Testing Implications

- Add or update unit tests for `normalizeWebSearchInput` to assert canonical `freshness` pass-through and invalid freshness handling.
- Add Exa request-body coverage proving `"realtime"`, `"day"`, `"week"`, and `"any"` produce the documented request shapes.
- Preserve regression coverage that `"realtime"` does not become `0`.
- Preserve `/findSimilar` tests confirming unsupported freshness-derived `maxAgeHours` is not sent.
- Check README wording for consistency with the tested mapping.
- Run the existing focused suites for `tool-params.test.ts`, `exa-search.test.ts`, and relevant `index.test.ts` coverage.
- Run the full test suite before completion in later phases.
