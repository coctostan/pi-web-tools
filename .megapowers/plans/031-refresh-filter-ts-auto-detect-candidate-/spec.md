## Goal
Update the cheap filter-model auto-detection contract so unconfigured prompt filtering uses the requested ordered fallback candidates while preserving configured-model overrides, auth/header behavior, raw fallback behavior, and README documentation accuracy.

## Acceptance Criteria
1. `AUTO_DETECT_MODELS` contains exactly these candidates in this order: `anthropic-cc/claude-haiku-4-5`, `openai-codex/gpt-5.4-mini`, `xiaomi/mimo-v2.5-pro`.

2. When `resolveFilterModel(registry, undefined)` is called, it attempts candidate resolution in the declared `AUTO_DETECT_MODELS` order.

3. When the first auto-detect candidate is available and has credentials, `resolveFilterModel(registry, undefined)` returns `anthropic-cc/claude-haiku-4-5`.

4. When the first auto-detect candidate is unavailable or unauthenticated and the second candidate is available with credentials, `resolveFilterModel(registry, undefined)` returns `openai-codex/gpt-5.4-mini`.

5. When earlier auto-detect candidates are unavailable or unauthenticated and the third candidate is available with credentials, `resolveFilterModel(registry, undefined)` returns `xiaomi/mimo-v2.5-pro`.

6. When no auto-detect candidate is available with credentials, `resolveFilterModel(registry, undefined)` returns a failure reason listing `anthropic-cc/claude-haiku-4-5`, `openai-codex/gpt-5.4-mini`, and `xiaomi/mimo-v2.5-pro` in order.

7. When `resolveFilterModel(registry, configuredModel)` is called with an arbitrary valid `provider/modelId` string, it resolves that configured model through `registry.find(provider, modelId)` even if the model is not present in `AUTO_DETECT_MODELS`.

8. When a configured model is unavailable or lacks credentials, `resolveFilterModel` returns the existing configured-model failure shape with a clear reason naming the configured model.

9. `resolveFilterModel` continues to use `ModelRegistry.getApiKeyAndHeaders` for auth resolution.

10. Successful model resolution continues to include custom auth headers returned by `getApiKeyAndHeaders`.

11. `filterContent` continues to pass resolved `apiKey`, `headers`, and `signal` through to `completeFn`.

12. `filterContent` continues to return `{ filtered: null, reason }` without calling `completeFn` when `resolveFilterModel` fails to resolve a model.

13. `filter.test.ts` covers the auto-detect candidate list from a single candidate-list source or table so ordering expectations are not duplicated across unrelated assertions.

14. `filter.test.ts` includes fallback coverage from the first candidate to the second candidate and from earlier candidates to the third candidate.

15. README default-filter-model references are updated to `anthropic-cc/claude-haiku-4-5`.

16. `config.ts` behavior remains unchanged unless stale default-model documentation is found there.

## Out of Scope
- Adding user-facing configuration for multiple fallback models.
- Adding dynamic model ranking, benchmarking, pricing lookup, or latency measurement.
- Changing the filter prompt.
- Changing the minimum filter response length behavior.
- Changing the `filterModel` config shape.
- Adding new provider integrations.
- Restricting configured `filterModel` values to the auto-detect list.
- Changing `filterContent` caller signatures or external API behavior.
- Exporting `AUTO_DETECT_MODELS` as public API unless needed only as an implementation detail for maintainable tests.

## Open Questions
None.

## Requirement Traceability
- R1 -> AC 1
- R2 -> AC 3
- R3 -> AC 4
- R4 -> AC 5
- R5 -> AC 15
- R6 -> AC 7
- R7 -> AC 7
- R8 -> AC 9
- R9 -> AC 10, AC 11
- R10 -> AC 8
- R11 -> AC 2
- R12 -> AC 6
- R13 -> AC 13
- R14 -> AC 14
- R15 -> AC 15
- R16 -> AC 16
- O1 -> Out of Scope unless implemented as a local code comment without behavior change
- O2 -> Out of Scope unless needed as a non-public implementation detail for tests
- D1 -> Out of Scope
- D2 -> Out of Scope
- D3 -> Out of Scope
- D4 -> Out of Scope
- D5 -> Out of Scope
- C1 -> AC 7, AC 12, Out of Scope
- C2 -> Out of Scope
- C3 -> AC 12
- C4 -> Out of Scope
- C5 -> AC 2, AC 13, AC 14
- C6 -> AC 15
- C7 -> AC 1, AC 4
- C8 -> AC 1, AC 3
