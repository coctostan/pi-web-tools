# Brainstorm: Haiku Filter on fetch_content

## Approach

Add a `prompt` parameter to `fetch_content` that sends fetched page content through a cheap model (Haiku / GPT-4o-mini) with a specific question, returning only the focused answer (~200-1000 chars) instead of raw content (~5-30K chars). This is the single highest-impact change for context reduction — 10-50x fewer tokens entering the main model's context per fetch, at ~$0.003-0.005 per call.

The filter logic lives in a new `filter.ts` module with a clean `filterContent(content, prompt, ctx)` interface. Model resolution follows a config-first strategy with auto-fallback: check `web-tools.json` `filterModel` config → try Haiku → try GPT-4o-mini → return raw content with warning. The filter uses a strict extraction system prompt — it answers using ONLY the provided content, preserves code snippets verbatim, and says so when the content doesn't answer the question. The filter is a lens, not a brain.

The critical design principle: **never fail the fetch because of the filter.** If any part of the filter pipeline fails (no model, API error, empty response), the tool degrades gracefully to its current behavior — raw content returned with a warning. The agent always gets something useful.

## Key Decisions

- **Config-first with auto-fallback**: Check `web-tools.json` `filterModel` → Haiku → GPT-4o-mini → raw fallback. Zero-config experience for most users, explicit override for power users.
- **Separate `filter.ts` module**: Clean boundary, easy to unit test with mocked `complete()`. Keeps `index.ts` from growing further.
- **Strict extraction system prompt**: "Answer using ONLY the provided content. Include code snippets verbatim." No hallucination from training data. The main model does the thinking.
- **Graceful degradation on all failures**: No model available, API error, empty response — all return raw content with warning. Never break the fetch.
- **`prompt` applies to all URLs in a multi-URL call**: No mixed prompt/no-prompt per URL. Simple interface. Agent makes separate calls if needed.
- **`_ctx` parameter activated**: Currently unused in `execute` handlers — gets used for first time to access `modelRegistry.getApiKey()`.
- **Tool description updated**: Nudge agent to prefer `prompt` parameter via description text.

## Components

1. **`filter.ts`** (new) — `filterContent(content, prompt, ctx)` function. Handles model resolution, system prompt construction, `complete()` call, response validation. Returns `{ filtered, model }` or `{ filtered: null, reason }`.
2. **`config.ts`** (modified) — Add `filterModel` field to config type and loader. Default: `undefined`.
3. **`index.ts`** (modified) — `fetch_content` execute handler: add `prompt` to tool schema, branch after extraction to call `filterContent`, format result with source URL. Multi-URL: filter calls parallelized with `p-limit(3)`.
4. **Tool description** (modified) — Add guidance line about `prompt` parameter.

## Testing Strategy

**`filter.ts` unit tests** (bulk of new tests):
- Model resolution: config override → uses configured model; no config → tries Haiku; no Haiku key → GPT-4o-mini fallback; no keys → returns `{ filtered: null, reason: "no-model" }`
- Successful filtering: mock `complete()` → verify returns `{ filtered: "<answer>", model }` 
- System prompt correctness: verify messages passed to `complete()` include strict extraction prompt, page content, user question
- API error handling: mock `complete()` throwing → verify graceful fallback
- Empty/short response handling: mock returning < 20 chars → verify fallback

**`index.ts` integration tests** (wiring):
- `fetch_content` with `prompt` → calls filter, returns filtered result
- `fetch_content` with `prompt` but filter fallback → returns raw content + warning
- `fetch_content` without `prompt` → unchanged behavior (regression)
- Multi-URL with `prompt` → filtered results for each URL

**`config.ts` tests**:
- `filterModel` read from config when present
- Missing `filterModel` defaults to `undefined`

All tests mock `complete()` and `ctx.modelRegistry.getApiKey()`. No real API calls. Uses existing vitest infrastructure.
