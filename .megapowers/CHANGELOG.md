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
- `retryFetch()` utility in `retry.ts`: wraps `fetch()` with exponential backoff (1s → 2s, max 2 retries). Retries on 429/500/502/503/504 and network errors (`TypeError: fetch failed`, `ECONNRESET`, `ETIMEDOUT`). Respects `AbortSignal` both before and during backoff waits. (#004)
- `searchExa()` and `searchContext()` now use `retryFetch()` — transient Exa API failures silently recover without surfacing to the caller. (#004)
- Batch `web_search` with multiple queries now executes them concurrently via `p-limit(3)` instead of sequentially; partial failures are isolated per query. (#005)
- Multi-URL `fetch_content` now uses `p-limit(3)` for bounded concurrency instead of unbounded `Promise.all`. (#005)
### Added (015)
- Session-scoped URL cache in `extractContent()`: same URL fetched twice within 30 minutes returns the cached result — zero additional network requests. Cache is cleared on every session start (`session_start`, `session_switch`, `session_fork`, `session_tree`). (#006)
- `clearUrlCache()` export from `extract.ts` for explicit cache invalidation. (#006)
- `constants.ts` with `HTTP_FETCH_TIMEOUT_MS` (30 s) and `URL_CACHE_TTL_MS` (30 min), replacing magic `30000` literals in `extract.ts`. (#007)

### Changed (015)
- `github-extract.ts` converted from synchronous `fs` (`existsSync`, `readFileSync`, `statSync`, `readdirSync`, `rmSync`, `openSync`, `readSync`, `closeSync`) to `fs.promises` equivalents — no more event-loop blocking during repo traversal. (#007)
### Removed (015)
- Dead `sessionActive` variable from `index.ts` (was set but never read). (#007)
- Stale `todo.md` from repository root. (#007)

### Added (016)
- `freshness` parameter on `web_search`: controls result recency via Exa's `maxAgeHours` field. Values: `"realtime"` (0h), `"day"` (24h), `"week"` (168h), `"any"` (no filter, default). Omitting the param sends no `maxAgeHours` to Exa — identical to previous behavior. (#008)
- `similarUrl` parameter on `web_search`: finds pages similar to a given URL by routing to Exa's `POST /findSimilar` endpoint instead of `/search`. Mutually exclusive with `query`/`queries`. Returns the same `ExaSearchResult[]` format. (#009)
- `findSimilarExa()` function in `exa-search.ts`: mirrors `searchExa` structure (retry, abort signal, result parser) but targets `/findSimilar` with a `url` body field instead of `query`. (#009)

### Fixed (020)
- `freshness: "realtime"` now maps to `maxAgeHours: 1` (last 1 hour) instead of `0`. Exa treated `0` as "no filter", making `"realtime"` functionally identical to `"any"` — returning results from years ago. (#018)
- `similarUrl` searches now forward `includeDomains` and `excludeDomains` to Exa's `/findSimilar` endpoint. Previously these were silently dropped. (#019)
- `similarUrl` searches now emit a user-visible warning note when `freshness` or `category` are provided, since `/findSimilar` does not support those filters. (#019)

### Added (022)
- `details.ptcValue` on all 4 tool executors (`web_search`, `fetch_content`, `code_search`, `get_search_content`): structured payloads that PTC's `code_execution` consumes directly instead of parsing markdown text. (#022)

### Changed (023)
- `fetch_content` multi-URL+prompt `ptcValue` shape cleaned up: `urls` → `sources`, `filtered` → `answer`, `charCount` → `contentLength`, `prompt` echoed at top level. Per-source entries are now minimal — success: `{ url, answer, contentLength }`, error: `{ url, error }`, fallback: `{ url, title, content, filePath, contentLength }`. No null-heavy entries. (#023)
- Persistent TTL-based research cache for `fetch_content` + `prompt`: repeated doc lookups return cached answers instantly — zero network calls, zero model calls. Cache key is `SHA-256(url + prompt + filterModelId)`, stored at `~/.pi/cache/web-tools/research-cache.json`. Default TTL: 24h, configurable via `cacheTTLMinutes` in `web-tools.json`. (#024)
- `noCache` parameter on `fetch_content`: bypasses cache read (always fetches fresh) while still updating the cache with the new result. (#024)
- `cacheTTLMinutes` config field in `~/.pi/web-tools.json` (integer, minutes, default: 1440). (#024)
- Multi-URL + prompt cache: each URL is independently cache-checked — some may hit cache while others miss. (#024)
