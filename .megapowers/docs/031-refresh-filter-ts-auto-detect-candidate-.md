# Refresh filter auto-detect candidates

## Summary

Unconfigured prompt filtering now resolves filter models using this ordered fallback list:

1. `anthropic-cc/claude-haiku-4-5`
2. `openai-codex/gpt-5.4-mini`
3. `xiaomi/mimo-v2.5-pro`

The README full config example now documents `anthropic-cc/claude-haiku-4-5`, matching the first auto-detect candidate.

## Why

The previous default candidate path used the stale `anthropic/claude-haiku-4-5` provider string. This changed the filter-model contract so unconfigured filtering tries the requested providers in order while preserving explicit `filterModel` overrides, auth/header handling, fallback responses, and cache behavior.

## API / behavior surface

Confirmed signatures:

```ts
resolveFilterModel(registry: ModelRegistry, configuredModel?: string): Promise<FilterModelResult>
```

`resolveFilterModel` still resolves configured `provider/modelId` strings first via `registry.find(provider, modelId)`. Without a configured model, it iterates `AUTO_DETECT_MODELS` and uses `ModelRegistry.getApiKeyAndHeaders` through `tryResolve` for auth/header resolution.

```ts
filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn,
  signal?: AbortSignal
): Promise<FilterResult>
```

`filterContent` still returns `{ filtered: null, reason }` without calling `completeFn` when model resolution fails, and still passes `apiKey`, `headers`, and `signal` through to `completeFn` when resolution succeeds.

New internal helper:

```ts
getFilterModelKeys(configuredModel?: string): string[]
```

This returns `[configuredModel]` for explicit config, otherwise the auto-detect model keys in fallback order. `index.ts` uses it so prompt-cache lookups match the same model order as filtering.

New cache helper:

```ts
getCachedForModels(
  url: string,
  prompt: string,
  models: readonly string[],
  _ttlMinutes: number,
  cacheFilePath: string
): string | null
```

This checks multiple model cache keys as one logical cache lookup. It avoids inflating cache miss counters when default auto-detect checks multiple candidate model IDs.

## Files changed

- `filter.ts` — updated auto-detect candidates and added `getFilterModelKeys`.
- `filter.test.ts` — refreshed model-resolution and filter-content contract tests.
- `index.ts` — changed prompt-cache reads to use auto-detect/configured model key order.
- `research-cache.ts` — added multi-model cache lookup helper preserving hit/miss semantics.
- `index.test.ts` — added cache candidate-order coverage.
- `research-cache.test.ts` — added cache hit/miss counter coverage for multi-model lookup.
- `ptc-value.test.ts` — updated mocked research-cache surface.
- `README.md` — updated documented filter model example.

## Verification

- `npx vitest run index.test.ts filter.test.ts ptc-value.test.ts research-cache.test.ts` — 4 files passed, 139 tests passed.
- `npm test` — 27 files passed, 352 tests passed.
- `npm run build` — build successful.
- Code review completed with no remaining actionable findings.
