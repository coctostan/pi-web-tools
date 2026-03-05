# Feature: Haiku Filter on fetch_content

**Issue:** 012-haiku-filter-on-fetch-content  
**Released in:** v2.0.1 (planned)  
**Effort:** M (~2-3 hours)

---

## What Was Built

A `prompt` parameter was added to the `fetch_content` tool. When provided, the fetched page content is piped through a cheap filter model (Claude Haiku or GPT-4o-mini) that answers the specific question. Only the focused answer (~200-1000 chars) enters the main model's context, instead of the full raw page (~5-30K chars).

---

## Why

Every `fetch_content` call without filtering injects 5-30K characters of raw HTML-to-markdown into the conversation. Over a multi-step research session this balloons context rapidly, degrading response quality and increasing cost. The filter model call costs ~$0.003-0.005 per page and returns a targeted answer, achieving **10-50x context reduction** on average.

---

## How It Works

### New parameter: `prompt`

```ts
fetch_content({ url: "https://...", prompt: "What is the rate limit?" })
// → "Source: https://...\n\nThe API allows 100 requests/minute."
```

### Filter model resolution (in `filter.ts`)

1. If `filterModel` is set in `~/.pi/web-tools.json`, use that model (format: `"provider/model-id"`)
2. Otherwise auto-detect: try `anthropic/claude-haiku-4-5` → `openai/gpt-4o-mini`
3. If neither is available (no API key), fall back to raw content with a `⚠` warning

### Fallback guarantees

All failure modes return raw content with a clear warning rather than erroring:
- No filter model available → `⚠ No filter model available. Returning raw content.`
- API call fails → `⚠ Filter model error: <message>`
- Response too short (< 20 chars) → `⚠ Filter response too short (N chars)`

Raw content fallbacks truncate at 30K chars (same as existing `MAX_INLINE_CONTENT` limit) and include a `get_search_content` hint.

### Multi-URL support

When `urls` is provided with `prompt`, each URL is filtered in parallel using `p-limit(3)`. Results are joined with `---` separators. Failed URLs show `❌ <url>: <error>`.

### System prompt

The filter model is given a strict system prompt:
- Answer using **ONLY** information in the page content
- Preserve code snippets **verbatim**
- State when the content doesn't answer the question

---

## Files Changed

| File | Change |
|------|--------|
| `filter.ts` | **New** — `resolveFilterModel`, `filterContent`, types |
| `index.ts` | Added `prompt` to schema, wired single/multi-URL filter paths, `_ctx` → `ctx` |
| `config.ts` | Added `filterModel?: string` to `WebToolsConfig`, parse/validate from file |
| `tool-params.ts` | Added `prompt` extraction to `normalizeFetchContentInput` |
| `filter.test.ts` | **New** — 9 tests: model resolution, filtering success, API error, short response |
| `index.test.ts` | Extended — 3 test groups covering single-URL, multi-URL, no-prompt regression |
| `config.test.ts` | Extended — 2 tests for `filterModel` read/default |
| `tool-params.test.ts` | Extended — 2 tests for `prompt` extraction |

Total: +409 lines across 6 changed files, 2 new files.

---

## Configuration

Add to `~/.pi/web-tools.json`:

```json
{
  "filterModel": "anthropic/claude-haiku-4-5"
}
```

Omit `filterModel` to use auto-detection (Haiku → GPT-4o-mini → raw fallback).

---

## Usage

```ts
// Single URL — focused answer
fetch_content({
  url: "https://docs.api.example.com/rate-limits",
  prompt: "What are the rate limits for the free tier?"
})
// Returns: "Source: https://...\n\nFree tier: 100 req/min, 10K req/day."

// Multiple URLs — parallel filter
fetch_content({
  urls: ["https://react.dev/docs", "https://vuejs.org/guide"],
  prompt: "How do I handle side effects?"
})
// Returns filtered answer per URL, separated by ---

// No prompt — unchanged behavior
fetch_content({ url: "https://example.com/page" })
// Returns full page content (truncated at 30K chars)
```

---

## Testing

123 tests pass across 12 test files. The filter module has its own dedicated test file (`filter.test.ts`) covering all resolution paths and failure modes independently of the index integration tests.
