# Plan Review Revision Instructions

Add one task so AC 7 maps to a concrete implementation task rather than only existing coverage.

Required task:
- Test `resolveFilterModel(registry, configuredModel)` with malformed configured model strings such as `provider/`.
- Expected behavior: return a structured failure result and do not call `registry.find` or `getApiKeyAndHeaders` for malformed configured strings.
- Minimal implementation should add an explicit malformed-configured-model guard in `filter.ts` before registry lookup.
- Update `plan.md` coverage so AC 7 points to this new task.
