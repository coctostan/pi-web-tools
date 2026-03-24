# Brainstorm: Persistent TTL-based Research Cache for fetch_content

## Goal

Agents frequently look up the same docs with the same questions across sessions (e.g., "what's the API for X?"). Today every `fetch_content` + `prompt` call re-fetches the page and re-runs a Haiku filter call, costing network time and model tokens. A disk-persistent TTL cache eliminates both for repeated queries, making repeated lookups instant and free.

## Mode

`Direct requirements` — the issue description, roadmap item (3.0.3), and codebase scan make the desired behavior concrete. No design ambiguity remains.

## Must-Have Requirements

- **R1:** When `fetch_content` is called with a `prompt`, check a persistent cache before fetching/filtering. Cache key is `hash(url + prompt + filterModelId)`.
- **R2:** On cache hit where the entry is not expired, return the cached filtered answer immediately — zero network calls, zero model calls.
- **R3:** On cache miss or expired entry, fetch and filter normally, then store the result in the cache.
- **R4:** Default TTL is 24 hours.
- **R5:** TTL is configurable via `cacheTTLMinutes` in `~/.pi/web-tools.json` (integer, minutes).
- **R6:** Cache is disk-persistent — survives process restarts and session boundaries.
- **R7:** `session_shutdown` does NOT clear the persistent cache.
- **R8:** A `noCache: true` param on `fetch_content` bypasses the cache read (always fetches fresh) and updates the cache with the fresh result.
- **R9:** Cache entries store: `{ key, url, prompt, model, answer, fetchedAt, ttlMinutes }`.
- **R10:** Cache is stored as a single JSON file under a configurable directory (default: `~/.pi/cache/web-tools/`).
- **R11:** The cache module is a separate file (`research-cache.ts`) with pure functions, independent of `index.ts` internals.
- **R12:** Cached responses are visually indistinguishable from fresh ones to the agent — same return shape, but `details` includes a `cached: true` flag.

## Optional / Nice-to-Have

- **O1:** Log a debug-level note when a cache hit occurs (for observability during development).
- **O2:** `cacheDir` config option in `web-tools.json` to override the default cache directory.

## Explicitly Deferred

- **D1:** Cache size limits / eviction policy — defer until disk usage becomes a real problem.
- **D2:** Content-hash-based invalidation — too expensive (requires fetching to validate, defeating the purpose).
- **D3:** Caching raw fetches without `prompt` — file-first offload already handles those; caching filtered answers is the high-value target.
- **D4:** Cache for `web_search` or `code_search` results — different access patterns, different invalidation needs. Revisit separately if needed.

## Constraints

- **C1:** No new npm dependencies — use `node:fs` and `node:crypto` only.
- **C2:** Cache reads/writes must be synchronous or non-blocking enough to not add perceptible latency (JSON file is fine at expected scale of <1000 entries).
- **C3:** Must work with the existing config hot-reload pattern (`getConfig()` with 30s TTL).
- **C4:** Cache file corruption (invalid JSON) must be handled gracefully — treat as empty cache, don't crash.

## Open Questions

None.

## Recommended Direction

Create a new `research-cache.ts` module with a simple API: `getCached(url, prompt, model)` → cached answer or null, and `putCache(url, prompt, model, answer, ttlMinutes)`. The cache key is a SHA-256 hash of `url + prompt + model`. The backing store is a single JSON file (`~/.pi/cache/web-tools/research-cache.json`) read on first access and written on every `putCache` call. Expired entries are lazily pruned on read.

Integration into `index.ts` is minimal: in the `fetch_content` executor, when `prompt` is present, check the cache before calling `filterContent()`. On cache hit, return early with the cached answer and `details.cached = true`. On miss, proceed normally, then store the result. When `noCache: true`, skip the cache check but still update the cache after a fresh fetch.

The config extension is one new optional field (`cacheTTLMinutes`) in `WebToolsConfig`, defaulting to `1440` (24 hours). The `buildConfig()` function in `config.ts` picks it up with the existing pattern.

The module should be fully testable with filesystem mocks — no network, no model calls needed in tests. Tests cover: cache hit, cache miss, TTL expiry, `noCache` bypass, corrupt file recovery, key hashing correctness, and integration with the `fetch_content` flow.

## Testing Implications

- Unit tests for `research-cache.ts`: cache hit returns stored answer, cache miss returns null, expired entry returns null, `noCache` skips read but writes, corrupt JSON file is handled gracefully, entries are keyed correctly by url+prompt+model.
- Integration tests in `index.test.ts`: `fetch_content` with `prompt` returns cached answer on second call, `noCache: true` forces fresh fetch, `details.cached` flag is set correctly on cache hits.
- Config tests: `cacheTTLMinutes` is read from config file, defaults to 1440 when absent.
- No network or real model calls needed — all tests use mocks consistent with existing test patterns.
