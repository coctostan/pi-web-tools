# Verification Report: Persistent TTL-based Research Cache

## Test Suite Results

```
17 test files, 245 tests, 0 failures
```

Full suite run fresh this session — `npm test` exit 0.

## Per-Criterion Verification

### AC 1: Cache lookup before fetch/filter
**Evidence:** `index.ts:481-500` — early cache check for single-URL + prompt BEFORE `fetchOne()` is called. Key is `SHA-256(url + prompt + filterModelId)` via `getCacheKey()` in `research-cache.ts:15-17`. Test `"returns cached answer on cache hit without calling extractContent or filterContent"` confirms `extractContent` and `filterContent` are NOT called on cache hit.
**Verdict:** pass

### AC 2: Cache hit returns immediately
**Evidence:** Test `"returns cached answer on cache hit without calling extractContent or filterContent"` — `state.extractContent` not called, `state.filterContent` not called, cached text returned. `index.ts:486-499` returns immediately on cache hit.
**Verdict:** pass

### AC 3: Cache miss fetches and stores
**Evidence:** Test `"fetches and stores result on cache miss"` — `getCached` returns null, `extractContent` called, `filterContent` called, `putCache` called with the filtered answer. `index.ts:538-540` calls `putCache` after successful filter.
**Verdict:** pass

### AC 4: Default TTL is 24 hours (1440 minutes)
**Evidence:** `config.ts:42` — `cacheTTLMinutes: 1440` in `DEFAULT_CONFIG`. Test `"defaults cacheTTLMinutes to 1440 when missing"` passes in `config.test.ts`.
**Verdict:** pass

### AC 5: TTL is configurable
**Evidence:** `config.ts:112-114` — reads `cacheTTLMinutes` from file, falls back to default. Tests `"reads cacheTTLMinutes from config file"` (value 60) and `"ignores non-number cacheTTLMinutes"` (falls back to 1440) pass. Config hot-reload: `getConfig()` uses existing 30s cache pattern (`config.ts:116-122`).
**Verdict:** pass

### AC 6: Cache survives restarts
**Evidence:** `research-cache.ts:34-35` — `writeFileSync` to disk. `index.ts:40` — default path `~/.pi/cache/web-tools/research-cache.json`. Test `"cache survives across separate getCached calls (disk persistence)"` writes then reads back from file. Test `"creates parent directories if cache directory does not exist"` confirms `mkdirSync({ recursive: true })`.
**Verdict:** pass

### AC 7: session_shutdown does not clear persistent cache
**Evidence:** `index.ts:61-67` — `handleSessionShutdown` calls `clearResults()` (in-memory), `resetConfigCache()`, etc. but has NO reference to `getCached`, `putCache`, or any cache-clearing function. Test `"session_shutdown does NOT call any cache-clearing function from research-cache"` explicitly verifies.
**Verdict:** pass

### AC 8: noCache param
**Evidence:** `tool-params.ts:81` — `noCache` extracted as boolean. `index.ts:108` — `noCache` in FetchContentParams schema. `index.ts:449` — destructured. `index.ts:482` — `!noCache` guard. Test `"noCache skips cache read but still writes to cache after fresh fetch"` — `getCached` not called, `putCache` IS called.
**Verdict:** pass

### AC 9: Cache entry shape
**Evidence:** `research-cache.ts:5-13` — `CacheEntry` interface: `{ key, url, prompt, model, answer, fetchedAt, ttlMinutes }`. `research-cache.ts:83` — `putCache` writes all fields.
**Verdict:** pass

### AC 10: Corrupt cache recovery
**Evidence:** `research-cache.ts:27-29` — `loadCache` catch block returns `{}`. Tests `"handles corrupt cache file gracefully (returns null, does not throw)"` and `"putCache overwrites corrupt cache file successfully"` both pass.
**Verdict:** pass

### AC 11: Separate module
**Evidence:** `research-cache.ts` is a standalone file with exports: `getCacheKey`, `getCached`, `putCache`, `CacheEntry`. No imports from `index.ts`. 14 unit tests in `research-cache.test.ts`.
**Verdict:** pass

### AC 12: Cached response shape
**Evidence:** `index.ts:489` — cached response uses `Source: ${url}\n\n${cachedAnswer}` format, same as fresh (`index.ts:542`). `details.cached: true` set at `index.ts:495`. Test confirms `result.details.cached` is `true` on hit, `undefined` on miss.
**Verdict:** pass

### AC 13: Multi-URL + prompt
**Evidence:** `index.ts:671-679` — per-URL cache check in multi-URL + prompt flow. Test `"multi-URL + prompt: independently checks cache per URL, mixing hits and misses"` — URL A cached, URL B fresh, `filterContent` called once (only for B), `putCache` called for B.
**Verdict:** pass

### AC 14: Lazy expiry pruning
**Evidence:** `research-cache.ts:74-81` — `putCache` iterates all entries and deletes expired ones before writing. Test `"prunes expired entries when writing a new entry"` — expired entry removed from disk, only fresh entry remains.
**Verdict:** pass

### AC 15: No new npm dependencies
**Evidence:** `git diff main -- package.json` produces no output — package.json unchanged. `research-cache.ts` imports only `node:crypto`, `node:fs`, `node:path`.
**Verdict:** pass

## Overall Verdict

**pass** — All 15 acceptance criteria verified with code inspection and test evidence. 245 tests passing, 0 failures, no new dependencies.
