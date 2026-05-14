## Goal

Make the model used for question-guided `fetch_content({ prompt })` summarization/filtering configurable so users can choose an available Pi model instead of being locked to a hardcoded default, while preserving the current zero-config fallback behavior.

## Mode

Direct requirements.

The requested behavior is concrete and already maps to existing config and filtering architecture. The main need is to capture the expected behavior clearly and verify whether the current partial implementation fully satisfies it.

## Must-Have Requirements

R1. Users can configure the summarization/filter model through `~/.pi/web-tools.json`.

R2. The configured model must use the existing `filterModel` config field.

R3. The configured model must use a stable `provider/model-id` string format.

R4. When a valid configured model is present and available through Pi’s model registry, `fetch_content({ prompt })` must use that model for content filtering.

R5. When no `filterModel` is configured, the tool must preserve zero-config behavior by auto-detecting from the existing fallback candidate list.

R6. When the configured model is missing, unavailable, or lacks credentials, the tool must fail gracefully rather than crashing the fetch.

R7. If filtering cannot run successfully, `fetch_content` must still return useful raw content with a warning, preserving the existing “filter failure must not fail fetch” behavior.

R8. Research-cache keys for prompt-filtered fetches must distinguish results by the effective filter model so cached summaries from one model are not incorrectly reused for another model.

R9. The selected filter model should be visible in successful filtered-result details so behavior is inspectable.

R10. Documentation must show how to configure `filterModel` and what happens when it is omitted.

R11. Tests must cover configured-model selection, default auto-detection, unavailable configured model fallback behavior, and cache behavior across model choices.

## Optional / Nice-to-Have

O1. Improve validation or warning messages for malformed model strings.

O2. Document example model identifiers for common providers beyond the default candidate.

## Explicitly Deferred

D1. Do not add per-call model override parameters to `fetch_content` in this slice.

D2. Do not add a UI or command for changing the summarization model in this slice.

D3. Do not replace the existing filtering prompt or summarization behavior beyond model selection.

D4. Do not add new model providers outside Pi’s existing model registry mechanism.

D5. Do not introduce a new `summarizationModel` alias in this slice; `filterModel` is the desired config name.

## Constraints

C1. Existing `filterModel` config behavior must remain backward-compatible if already shipped or documented.

C2. The default zero-config experience must continue to work for users who do not set any model config.

C3. Filtering must remain a context-reduction lens only; the main agent remains responsible for synthesis and reasoning.

C4. Fetch behavior must degrade gracefully on model failures, missing credentials, short responses, or provider errors.

C5. The implementation should use Pi’s model registry/auth flow rather than separate provider-specific API key handling.

C6. Cache behavior must remain compatible with the persistent research cache and its TTL configuration.

C7. Avoid broad refactors; this issue should stay focused on configurability and verification.

## Open Questions

None.

## Recommended Direction

Use the existing `filterModel` implementation as the baseline rather than adding a parallel configuration path. The current architecture already has a clean separation: `config.ts` loads configuration, `filter.ts` resolves and invokes the model, and `index.ts` wires prompt-based `fetch_content` into filtering and caching.

The likely spec should focus on closing gaps: ensure source and built output are consistent, verify there are no remaining hardcoded default model assumptions in runtime behavior, and ensure cache lookup/write uses the effective model identity. The public configuration name should remain `filterModel`; introducing `summarizationModel` would add compatibility surface without improving the current slice.

The safest minimal direction is to keep `filterModel` as the canonical field because it is already documented, tested, and accepted by the user. Documentation should clarify that `filterModel` means “the summarization/filter model used by `fetch_content({ prompt })`.”

## Testing Implications

- Unit-test config loading for configured `filterModel`, missing `filterModel`, and malformed model strings.
- Unit-test model resolution order: configured model first, then auto-detect candidates.
- Unit-test graceful fallback when configured model is unavailable or unauthenticated.
- Unit-test `fetch_content({ prompt })` passes the configured model into filtering.
- Unit-test cache behavior so different configured/effective models do not incorrectly share cached answers.
- Documentation review should verify README examples match actual config behavior.
