# Feature: Persistent TTL-based Research Cache for fetch_content

## Summary

Added a disk-persistent TTL cache for `fetch_content` prompt-filtered results. When an agent asks the same question about the same URL, the cached answer is returned instantly — zero network calls, zero model calls.

## Problem

Agents frequently look up the same docs with the same questions across sessions (e.g., "what's the API for X?"). Every `fetch_content` + `prompt` call re-fetched the page and re-ran a Haiku filter call, costing network time and model tokens on every repeat.

## Solution

A new `research-cache.ts` module provides disk-persistent caching keyed on `SHA-256(url + prompt + filterModelId)`. Cache entries are stored as JSON at `~/.pi/cache/web-tools/research-cache.json` and survive process restarts and session boundaries.

### Key behaviors

- **Cache hit**: Returns cached filtered answer immediately — no fetch, no filter model call
- **Cache miss**: Fetches and filters normally, stores the result before returning
- **Default TTL**: 24 hours (1440 minutes), configurable via `cacheTTLMinutes` in `~/.pi/web-tools.json`
- **`noCache: true` param**: Bypasses cache read but still updates the cache with fresh results
- **Multi-URL support**: Each URL is independently cache-checked when using `urls` array + `prompt`
- **Graceful degradation**: Corrupt cache files are treated as empty — never crashes

### Session lifecycle

- `session_shutdown` does NOT clear the persistent cache (contrast: in-memory store IS cleared)
- Cache persists across all session events

## Files Changed

| File | Change |
|------|--------|
| `research-cache.ts` | **New** — cache module (getCacheKey, getCached, putCache) |
| `research-cache.test.ts` | **New** — 14 unit tests |
| `config.ts` | Added `cacheTTLMinutes` field with 1440 default |
| `config.test.ts` | 3 new tests |
| `tool-params.ts` | Added `noCache` to normalizeFetchContentInput |
| `tool-params.test.ts` | 3 new tests |
| `index.ts` | Cache integration in single-URL and multi-URL prompt flows, `noCache` schema |
| `index.test.ts` | 5 new integration tests |
| `ptc-value.test.ts` | Added cache mock for compatibility |

## Configuration

```json
// ~/.pi/web-tools.json
{
  "cacheTTLMinutes": 1440  // default: 24 hours
}
```

## Architecture

- `research-cache.ts` is a standalone module with no imports from `index.ts`
- Uses only `node:fs` and `node:crypto` — no new npm dependencies
- Lazy expiry pruning on write keeps the cache file clean over time
- `details.cached: true` flag lets tooling distinguish cached from fresh responses
