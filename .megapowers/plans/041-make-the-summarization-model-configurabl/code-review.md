# Code Review — 041 make the summarization model configurable

## Files Reviewed

- `config.ts` — parses optional `filterModel` from config and rejects malformed values as `undefined`.
- `filter.ts` — resolves configured filter models before auto-detect candidates; returns structured no-model reasons; keeps `filterContent` fallback behavior.
- `index.ts` — gates early cache reads on configured `filterModel`, writes cache entries by effective model, exposes `details.filterModel` on configured cache hits and filtered results.
- `README.md` — documents `filterModel`, `provider/model-id` format, and auto-detect behavior when omitted.
- `config.test.ts`, `filter.test.ts`, `index.test.ts` — regression coverage for malformed config, configured model selection, fallback, cache separation, and result detail.
- `dist/config.js`, `dist/filter.js`, `dist/index.js` and generated declarations — build output regenerated from source.
- `.megapowers/plans/041-make-the-summarization-model-configurabl/verify.md` — verification artifact.

## External Review Input

### Codex review

Ran `codex_review(base="main")` with focus on configurable `filterModel`, cache separation, malformed handling, tests, docs, and `dist` output.

Result: no TypeScript correctness or regression findings. Codex noted local/tooling artifacts, especially `.codegraph/graph.db` and `.megapowers/state.json`, should be dropped if not intentionally versioned workflow state.

Adoption: accepted as a process note, not a code finding. `.megapowers/plans/...` artifacts are explicitly required by this workflow. `.megapowers/state.json` is workflow-managed and must not be edited directly. `.codegraph/graph.db` is a tooling artifact to exclude from the final commit/PR if the workflow does not intentionally track it.

### Codex adversarial review

Ran `codex_adversarial_review(base="main")` focused on public config and cache correctness risks.

Finding raised: malformed `filterModel` in config is converted to `undefined`, so fetch falls back to auto-detect instead of returning a malformed-config warning.

Disposition: rejected for this issue. The spec explicitly requires `getConfig()` to return `undefined` when `filterModel` is missing or malformed (AC2), and the plan’s Task 1 implemented that behavior. The malformed-config structured failure applies to `resolveFilterModel(registry, configuredModel)` when that function receives a malformed configured model directly; Task 6 added and verified that behavior at `filter.ts:67-68` and `filter.test.ts:81-95`. Changing config parsing to preserve malformed raw values would violate AC2 and the approved plan.

## Architecture / Breaking-Change Surface

Ran `impact` with `changeType: "signature_change"` on modified public symbols:

```text
impact(["getConfig","resolveFilterModel","filterContent","getFilterModelKeys"], signature_change)
Trust: fresh
No dependents found — 'getConfig' is an entry point with no callers.
No dependents found for 'resolveFilterModel' within depth 5.
No dependents found — 'filterContent' is an entry point with no callers.
No dependents found — 'getFilterModelKeys' is an entry point with no callers.
```

No public signature changes were introduced. Behavior changes are additive/defensive and covered by tests.

## Contract Review

- `getConfig(): WebToolsConfig` retains its existing signature. Contract guard is cache freshness (`cachedConfig !== null && now - cacheTimestamp < CONFIG_TTL_MS`). New parsing is isolated in `buildConfig()` at `config.ts:94-97`.
- `resolveFilterModel(registry: ModelRegistry, configuredModel?: string): Promise<FilterModelResult>` retains its signature. Guards now include malformed configured values (`!provider || !modelId`) before registry lookup at `filter.ts:67-68`.
- `filterContent(content, prompt, registry, configuredModel, completeFn, signal?): Promise<FilterResult>` retains its signature. Existing guards still return structured fallback reasons for no model, too-short output, and model errors at `filter.ts:102-135`.
- `getFilterModelKeys(configuredModel?: string): string[]` retains its signature and behavior: configured model returns a singleton key; omitted model returns auto-detect candidate keys.

## Strengths

- `config.ts:94-97` uses a single, explicit validation point for public `filterModel` config instead of duplicating checks across callers.
- `filter.ts:67-68` rejects malformed configured model strings before `registry.find`, which avoids unnecessary registry/auth calls and makes the failure reason deterministic.
- `filter.ts:81-88` preserves zero-config auto-detection by continuing to iterate `AUTO_DETECT_MODELS` only when no configured model is provided.
- `index.ts:472-491` now avoids early cache reads in auto-detect mode, preventing stale answers from a different effective model from being reused before model resolution.
- `index.ts:533` and `index.ts:682` write cache entries using `filterResult.model`, so cache writes are keyed by the actual effective model rather than a configured/default candidate list.
- `index.ts:531-543` and `index.ts:480-486` expose `details.filterModel` on successful filtered results and configured cache hits.
- Tests are behavior-oriented: `index.test.ts:1251-1297` verifies stale cache is not reused in auto-detect mode, and `filter.test.ts:81-95` verifies malformed configured model values do not touch the registry.
- Documentation is concise and aligned with the supported public surface at `README.md:357` and `README.md:364`.

## Findings

### Critical

None.

### Important

None.

### Minor

1. **`index.ts:485` combines two detail fields on one line.**
   - **What’s wrong:** `cached: true, filterModel: config.filterModel,` is less readable than the surrounding one-property-per-line style.
   - **Why it matters:** Minor maintainability/style consistency issue in a frequently inspected result details object.
   - **How to fix:** Split into:
     ```ts
     cached: true,
     filterModel: config.filterModel,
     ```
   - **Disposition:** Not blocking; generated `dist/index.js` mirrors the same formatting. This can be handled in a later cleanup or formatter pass.

2. **Tooling artifacts are present in the working tree.**
   - **File:line:** not line-based; observed by `git status --short` and Codex review.
   - **What’s wrong:** `.codegraph/graph.db` and `.megapowers/state.json` are modified in the worktree.
   - **Why it matters:** These are likely local/workflow artifacts and may not belong in the final code change.
   - **How to fix:** Exclude/reset them at the appropriate workflow or commit-selection step. Do not directly edit `.megapowers/state.json`.
   - **Disposition:** Not a code readiness blocker; note for final packaging/PR hygiene.

## Recommendations

- Keep the current spec-consistent behavior where malformed persisted config is ignored by `getConfig()` and direct malformed model strings are rejected by `resolveFilterModel()`.
- Before final PR/merge, ensure only intended source, tests, docs, generated `dist`, and required `.megapowers/plans/...` artifacts are included; exclude transient `.codegraph` state if not intentionally tracked.
- Consider a formatter cleanup for the one-line `cached: true, filterModel: ...` detail object after this workflow if style consistency is important.

## Assessment

ready

The implementation satisfies the verified behavior and does not introduce public signature breaks. External reviews found no TypeScript correctness issues. The adversarial malformed-config concern conflicts with AC2 and the approved plan, so it is not adopted. Remaining notes are minor style/process items and do not block advancement.
