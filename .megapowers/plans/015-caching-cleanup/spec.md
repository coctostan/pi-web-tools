# Spec: Caching & Cleanup (015)

## Goal

Add a session-scoped URL cache to `extractContent()` so repeated fetches of the same page within 30 minutes skip the network and return cached content. Bundle with housekeeping: a `constants.ts` to name the two currently-raw numbers, removal of the dead `sessionActive` variable in `index.ts`, deletion of the stale `todo.md`, and conversion of synchronous `fs` calls in `github-extract.ts` to `fs.promises`.

## Acceptance Criteria

1. `extractContent(url)` called twice with the same URL within 30 minutes makes exactly one network request.
2. The second call to `extractContent(url)` within the TTL returns a result with the same `url`, `title`, and `content` as the first call.
3. `extractContent(url)` called after the cached entry has exceeded 30 minutes in age makes a fresh network request.
4. `extract.ts` exports a `clearUrlCache()` function.
5. After `clearUrlCache()` is called, the next `extractContent(url)` call makes a fresh network request regardless of prior cache state.
6. `clearUrlCache()` is called during `onSessionStart` so each new session begins with an empty URL cache.
7. `constants.ts` exports `HTTP_FETCH_TIMEOUT_MS` with the value `30000`.
8. `constants.ts` exports `URL_CACHE_TTL_MS` with the value `1800000` (30 × 60 × 1000 ms).
9. `extract.ts` imports and uses `HTTP_FETCH_TIMEOUT_MS` from `constants.ts` — no raw `30000` literal appears in `extract.ts`.
10. `extract.ts` imports and uses `URL_CACHE_TTL_MS` from `constants.ts` for the cache TTL check.
11. `index.ts` does not declare a `sessionActive` variable.
12. The file `todo.md` does not exist in the repository root.
13. `github-extract.ts` uses no synchronous `fs` methods — `existsSync`, `readFileSync`, `statSync`, `readdirSync`, `rmSync`, `openSync`, `readSync`, and `closeSync` are all absent.
14. All existing tests in `github-extract.test.ts` pass after the async conversion.

## Out of Scope

- No `no-cache` / force-refetch parameter on `fetch_content`
- No persistent (cross-session) cache
- GitHub URL caching (handled separately by `cloneCache` in `github-extract.ts`)
- Cache size limits or LRU eviction
- Caching in `code_search` or `web_search` paths

## Open Questions

None.
