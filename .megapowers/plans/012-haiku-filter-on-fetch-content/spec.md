# Spec: Haiku Filter on fetch_content

## Goal

Add a `prompt` parameter to `fetch_content` that filters fetched page content through a cheap model (Haiku / GPT-4o-mini), returning a focused answer (~200-1000 chars) instead of raw content (~5-30K chars). This reduces main model context consumption by 10-50x per fetch call, at ~$0.003-0.005 per filter call.

## Acceptance Criteria

1. `fetch_content` tool schema accepts an optional `prompt` string parameter
2. When `prompt` is provided with a single URL, the extracted page content is sent to a cheap model with the prompt as the user's question
3. The filter model receives a system prompt instructing it to answer using ONLY the provided content, preserve code snippets verbatim, and state when the content doesn't answer the question
4. When filtering succeeds, the tool returns `"Source: <url>\n\n<filtered answer>"` instead of the full page content
5. `web-tools.json` supports an optional `filterModel` field in `"provider/model-id"` format (e.g. `"anthropic/claude-haiku-4-5"`)
6. When `filterModel` is configured, that model is used for filtering
7. When `filterModel` is not configured, the filter auto-detects: try `anthropic/claude-haiku-4-5` → `openai/gpt-4o-mini` → fallback to raw content
8. Auto-detection uses `ctx.modelRegistry.find(provider, modelId)` and `ctx.modelRegistry.getApiKey(model)` to check availability
9. When no filter model is available (no API key), the tool returns raw content with a warning: `"⚠ No filter model available. Returning raw content."`
10. When the filter model API call fails (network error, rate limit, model error), the tool returns raw content with a warning including the error message
11. When the filter model returns an empty or very short response (< 20 chars), the tool returns raw content with a warning
12. When `prompt` is provided with multiple URLs, each URL's content is filtered through the cheap model in parallel using `p-limit(3)`
13. When `prompt` is not provided, `fetch_content` behaves identically to current behavior (no regression)
14. The `fetch_content` tool description includes guidance nudging the agent to use the `prompt` parameter for focused answers
15. The filter logic lives in a separate `filter.ts` module exporting a `filterContent` function
16. `filterContent` returns `{ filtered: string, model: string }` on success or `{ filtered: null, reason: string }` on fallback
17. The `_ctx` parameter in `fetch_content`'s execute handler is activated (renamed from `_ctx` to `ctx`) to access `modelRegistry`

## Out of Scope

- Streaming progress updates during filter calls
- Per-URL prompt (mixed filtered/raw in a single multi-URL call)
- Retry logic on filter model API calls (a future 2.1.x item)
- Content truncation before sending to filter model (Haiku handles 200K tokens; page content rarely exceeds 8K tokens)
- Changes to `web_search`, `code_search`, or `get_search_content`
- File-first storage for raw content (separate 2.0.3 issue)

## Open Questions

None.
