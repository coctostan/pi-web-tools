---
id: 27
type: bugfix
status: open
created: 2026-05-13T15:45:10.549Z
priority: 1
---
# Replace deprecated ModelRegistry.getApiKey with getApiKeyAndHeaders in filter.ts
## Problem

`filter.ts` calls `registry.getApiKey(model)` in two places (`resolveFilterModel`, lines ~42 and ~55). Pi v0.63.0 replaced this with `ModelRegistry.getApiKeyAndHeaders(model)`, which returns a discriminated union:

```ts
{ ok: true; apiKey?: string; headers?: Record<string, string> }
| { ok: false; error: string }
```

The new signature is what current `@earendil-works/pi-coding-agent` (0.74.x) exposes. Against the live API, `registry.getApiKey` does not exist — `fetch_content({prompt})` cannot resolve a filter model and silently falls back to raw extraction.

## Acceptance criteria

- `resolveFilterModel` calls `getApiKeyAndHeaders` and threads both `apiKey` and `headers` through to `completeFn`.
- `FilterModelResult` carries optional `headers` so providers requiring custom request headers (Anthropic OAuth, Cloudflare AI Gateway, Xiaomi) keep working.
- `filterContent` passes the resolved headers to `completeFn(model, context, { apiKey, headers })`.
- Unit tests in `filter.test.ts` cover both `{ok: true, apiKey}` and `{ok: false, error}` paths and one case with headers.
- All 258 existing tests stay green.

## Files likely touched

- `filter.ts`
- `filter.test.ts`
- `index.ts` (call sites of `filterContent`, if header threading needs propagation — unlikely)

## References

- Pi changelog v0.63.0 — `getApiKey` → `getApiKeyAndHeaders`
- `dist/core/model-registry.d.ts:71` — current method signature

