---
id: 24
type: feature
status: in-progress
created: 2026-03-24T16:06:48.430Z
priority: 2
---
# Persistent TTL-based research cache for fetch_content
Add a disk-persistent cache for `fetch_content` prompt-filtered results so repeated doc lookups across sessions are instant and free.

## Motivation

Agents frequently look up the same docs pages with the same questions across sessions (e.g., "what's the API for X?"). Today every lookup re-fetches and re-filters, costing network time + a Haiku call. A TTL-based cache eliminates both for repeated queries.

## Design

### Cache key
`URL + prompt + model` — simple, no network needed to check cache.

### TTL
- Default: 24 hours (configurable in `~/.pi/web-tools.json`)
- Override per-request with `freshness: "force"` to bypass cache

### Storage
- Disk-based (survives sessions), stored under a configurable cache directory
- Simple JSON or SQLite — whatever is lightest
- Cache entries: `{ key, answer, fetchedAt, ttl, url, prompt, model, contentLength }`

### Cache behavior
1. On `fetch_content` with `prompt`: check cache first
2. Cache hit + not expired → return cached answer (zero network, zero model cost)
3. Cache miss or expired → fetch + filter normally, store result
4. `freshness: "force"` → skip cache check, always fetch fresh, update cache

### Session lifecycle
- Cache persists across sessions (unlike current in-memory storage)
- `session_shutdown` does NOT clear the persistent cache (that's the point)
- Config reload picks up TTL changes

## Not in scope
- Content-hash based invalidation (too expensive — requires fetch to validate)
- Caching raw fetches without prompt (file-first offload handles those)
- Cache size limits / eviction (defer until it's a real problem)
