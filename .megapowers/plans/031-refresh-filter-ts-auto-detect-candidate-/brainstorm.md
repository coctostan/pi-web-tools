## Goal
Refresh the cheap filter-model auto-detection list so `fetch_content({ prompt })` prefers the desired current low-cost model candidates while preserving configured-model overrides, fallback behavior, and documentation accuracy.

## Mode
Direct requirements

The issue already has concrete acceptance criteria and the candidate list has now been explicitly chosen by the user. The main need is to capture those requirements clearly for spec and implementation.

## Must-Have Requirements
R1. `AUTO_DETECT_MODELS` must be updated to exactly this ordered list: `anthropic-cc/claude-haiku-4-5`, `openai-codex/gpt-5.4-mini`, `xiaomi/mimo-v2.5-pro`.

R2. `anthropic-cc/claude-haiku-4-5` must be the first auto-detect candidate.

R3. `openai-codex/gpt-5.4-mini` must be the second auto-detect candidate.

R4. `xiaomi/mimo-v2.5-pro` must be the third auto-detect candidate.

R5. The first auto-detect candidate must be treated as the documented default when no `filterModel` is configured.

R6. The configured-model path must continue to accept arbitrary `provider/modelId` strings from config.

R7. The configured-model path must not be restricted to the auto-detect candidate list.

R8. Existing auth resolution behavior via `ModelRegistry.getApiKeyAndHeaders` must continue to work.

R9. Existing custom auth header threading from `getApiKeyAndHeaders` must continue to work.

R10. If a configured model is unavailable or lacks credentials, `resolveFilterModel` must continue returning a clear configured-model failure reason.

R11. If no configured model is provided, auto-detection must try candidates in declared order and return the first candidate with available model and credentials.

R12. If no auto-detect candidate is available, `resolveFilterModel` must return a clear failure reason that lists the candidates attempted.

R13. `filter.test.ts` must be updated so candidate-list expectations are parameterized or otherwise derive from a single candidate-list source rather than duplicating brittle hardcoded expectations.

R14. Tests must verify that fallback proceeds from the first candidate to later candidates when earlier candidates are unavailable or unauthenticated.

R15. README references to the default filter model must be updated to match `anthropic-cc/claude-haiku-4-5`.

R16. `config.ts` must only be changed if it contains stale default-model documentation or behavior; no config API change is required.

## Optional / Nice-to-Have
O1. Add a small comment near `AUTO_DETECT_MODELS` explaining that order represents preference and documentation default.

O2. Export the candidate list only if doing so materially improves test maintainability without widening the public API unnecessarily.

## Explicitly Deferred
D1. Do not add user-facing configuration for multiple fallback models in this issue.

D2. Do not add dynamic model ranking, benchmarking, pricing lookup, or runtime latency measurement.

D3. Do not change the filter prompt, output length threshold, or filtering behavior beyond model resolution.

D4. Do not change the `filterModel` config shape.

D5. Do not introduce a new provider integration; only use provider/model identifiers through the existing `ModelRegistry.find(provider, modelId)` resolution path.

## Constraints
C1. This is intended as a pure update with no API breakage.

C2. `filterContent` callers should not need changes.

C3. Existing behavior for raw fallback when no filter model is available must remain intact.

C4. The implementation should stay simple and avoid speculative abstraction.

C5. Tests should protect the candidate ordering because ordering determines default and fallback behavior.

C6. Documentation must not claim a default model that differs from the first auto-detect candidate.

C7. The implementation must use `openai-codex` as the provider for `gpt-5.4-mini`, not `openai`.

C8. The implementation must use `anthropic-cc` as the provider for `claude-haiku-4-5`, not `anthropic`.

## Open Questions
None.

## Recommended Direction
Keep the implementation centered on `filter.ts`: update `AUTO_DETECT_MODELS` to the exact requested ordered list and preserve the existing `resolveFilterModel` control flow. The ordering is part of the behavior because it determines the default model and fallback sequence.

The configured-model path should remain independent from the auto-detect list. A user-provided `filterModel` should still be parsed as arbitrary `provider/modelId`, resolved through `registry.find`, authenticated through `getApiKeyAndHeaders`, and either returned or rejected with the existing configured-model failure reason.

Tests should avoid copying the candidate list in several places. The spec/implementation should prefer a table-driven approach or a single test-local source of truth so future candidate changes require fewer brittle test edits. The tests should still explicitly verify candidate ordering, fallback behavior, configured-model override behavior, auth-header threading, and failure messaging.

Documentation should be updated only where it describes the default filter model. `config.ts` currently defaults `filterModel` to `undefined`, so it likely does not need a behavior change unless stale comments or examples are found.

## Testing Implications
- Unit test `resolveFilterModel` with no configured model and `anthropic-cc/claude-haiku-4-5` available.
- Unit test fallback from `anthropic-cc/claude-haiku-4-5` to `openai-codex/gpt-5.4-mini`.
- Unit test fallback from earlier candidates to `xiaomi/mimo-v2.5-pro`.
- Unit test no-candidate failure reason includes the attempted candidate list in order.
- Unit test configured arbitrary `provider/modelId` still works even if not in `AUTO_DETECT_MODELS`.
- Unit test configured-model failure behavior remains unchanged.
- Unit test auth headers still pass through to `filterContent`.
- Documentation check/update for README default filter-model references.
