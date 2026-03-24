# Spec: Persistent TTL-based Research Cache for fetch_content

## Goal

Add a disk-persistent TTL cache for `fetch_content` prompt-filtered results so repeated doc lookups across sessions are instant and free — zero network calls, zero model calls on cache hit.

## Acceptance Criteria

1. **Cache lookup before fetch/filter:** When `fetch_content` is called with a `prompt`, the system checks a persistent cache before making any network or model calls. Cache key is `SHA-256(url + prompt + filterModelId)`.

2. **Cache hit returns immediately:** On cache hit where the entry has not expired, the cached filtered answer is returned with no network fetch and no filter model call.

3. **Cache miss fetches and stores:** On cache miss or expired entry, fetch and filter proceed normally, and the result is written to the cache before returning.

4. **Default TTL is 24 hours (1440 minutes).**

5. **TTL is configurable:** `cacheTTLMinutes` in `~/.pi/web-tools.json` (integer) overrides the default. Config hot-reload (existing 30s pattern) picks up changes.

6. **Cache survives restarts:** Cache is stored as a JSON file on disk (default: `~/.pi/cache/web-tools/research-cache.json`). It persists across process restarts and session boundaries.

7. **`session_shutdown` does not clear the persistent cache.** (Contrast: in-memory `storage.ts` store IS cleared.)

8. **`noCache` param:** `fetch_content` accepts an optional `noCache: true` boolean. When set, the cache read is skipped (always fetches fresh), but the fresh result still updates the cache.

9. **Cache entry shape:** Each entry stores `{ key, url, prompt, model, answer, fetchedAt, ttlMinutes }`.

10. **Corrupt cache recovery:** If the cache JSON file is invalid or unreadable, treat it as an empty cache and continue without error.

11. **Separate module:** Cache logic lives in `research-cache.ts` with pure functions (`getCached`, `putCache`, etc.), independent of `index.ts` internals.

12. **Cached response shape:** Cached responses have the same return shape as fresh ones. `details` includes `cached: true` on cache hits so tooling can distinguish, but the agent-facing text content is identical.

13. **Multi-URL + prompt:** When `fetch_content` is called with multiple `urls` and a `prompt`, each URL is independently cache-checked. Some may hit cache while others miss — they compose naturally.

14. **Lazy expiry pruning:** Expired entries are pruned from the in-memory representation on cache read operations, and the pruned state is persisted on the next write.

15. **No new npm dependencies.** Only `node:fs` and `node:crypto`.

## Out of Scope

- **D1:** Cache size limits / eviction policy — defer until disk usage is a real problem.
- **D2:** Content-hash-based invalidation — requires fetching to validate, defeating the purpose.
- **D3:** Caching raw fetches without `prompt` — file-first offload handles those.
- **D4:** Cache for `web_search` or `code_search` — different access patterns, revisit separately.
- **O1:** Debug logging on cache hit — nice-to-have, not required for this slice.
- **O2:** `cacheDir` config option — the default path is sufficient; defer configurability.

## Open Questions

None.

## Requirement Traceability

- `R1 → AC 1`
- `R2 → AC 2`
- `R3 → AC 3`
- `R4 → AC 4`
- `R5 → AC 5`
- `R6 → AC 6`
- `R7 → AC 7`
- `R8 → AC 8`
- `R9 → AC 9`
- `R10 → AC 6` (stored as JSON file at default path)
- `R11 → AC 11`
- `R12 → AC 12`
- `O1 → Out of Scope`
- `O2 → Out of Scope`
- `D1–D4 → Out of Scope`
- `C1 → AC 15`
- `C2 → AC 14` (lazy pruning keeps reads fast)
- `C3 → AC 5` (config hot-reload)
- `C4 → AC 10`

AC 13 (multi-URL composition) is new — implied by R1-R3 combined with the existing multi-URL `fetch_content` flow but called out explicitly.

AC 14 (lazy pruning) is a design detail from the recommended direction that ensures C2 (no perceptible latency) is met.
