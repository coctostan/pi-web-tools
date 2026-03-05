## [Unreleased]

### Added
- `prompt` parameter on `fetch_content`: filters page content through a cheap model (Haiku / GPT-4o-mini) and returns a focused answer (~200-1000 chars) instead of full raw content (~5-30K chars). Achieves 10-50x context reduction per fetch call. Auto-detects available filter model; gracefully falls back to raw content with a `⚠` warning when no model is available or the API call fails. Multi-URL fetches are filtered in parallel using `p-limit(3)`. (#012)
- `filterModel` field in `~/.pi/web-tools.json` to explicitly configure the filter model in `"provider/model-id"` format (e.g. `"anthropic/claude-haiku-4-5"`). (#012)
- `detail` parameter on `web_search`: switches result mode between `"summary"` (default, ~1 line per result, ~1-2K tokens) and `"highlights"` (3 sentences × 3 per URL, ~5-15K tokens). Summary mode is now the default, replacing the previous highlights-only behavior. (#013)
- File-first storage for raw `fetch_content` results: all non-GitHub, non-filtered fetches now write content to a temp file and return a 500-char preview + file path instead of inlining up to 30K chars. Agent uses `read` to explore further. Files are tracked and cleaned up on session shutdown. (#013)
- `FILE_FIRST_PREVIEW_SIZE` constant (500) in `offload.ts` for the file-first preview size, distinct from the `tool_result` interceptor's `PREVIEW_SIZE` (2000). (#013)

### Changed
- `web_search` results now default to summary mode (~1-2K tokens per search vs. ~5-15K previously). Existing callers relying on highlights should pass `detail: "highlights"`. (#013)
- `fetch_content` without `prompt` no longer inlines content up to 30K; always writes to a temp file and returns a preview + path. (#013)
- `formatSearchResults()` no longer truncates snippets to 200 chars (summaries are already brief). (#013)

### Added (014)
- `retryFetch()` utility: exponential backoff with jitter for Exa API calls, retrying up to 3 times on 429/503/504 and network errors. Configurable `maxAttempts` and `baseDelayMs`. (#014)
- `p-limit(3)` concurrency control for multi-URL `fetch_content` and multi-query `web_search` — max 3 parallel requests instead of unbounded `Promise.all`. (#014)

### Added (015)
- Session-scoped URL cache in `extractContent()`: same URL fetched twice within 30 minutes returns cached result with zero additional network requests. Cache is cleared on every session start event. (#006)
- `clearUrlCache()` export from `extract.ts` for explicit cache invalidation. (#006)
- `constants.ts` with `HTTP_FETCH_TIMEOUT_MS` (30 s) and `URL_CACHE_TTL_MS` (30 min), replacing magic `30000` literals in `extract.ts`. (#007)

### Changed (015)
- `github-extract.ts` fully converted from synchronous `fs` to `fs.promises` — eliminates event-loop blocking during GitHub repo traversal. (#007)

### Removed (015)
- Dead `sessionActive` variable from `index.ts` (was set but never read). (#007)
- Stale `todo.md` from repository root. (#007)
