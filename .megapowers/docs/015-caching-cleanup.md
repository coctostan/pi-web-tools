# Feature: Caching & Cleanup (015)

## Summary

Adds a session-scoped URL cache to `extractContent()` so repeated fetches of the same URL within a 30-minute window skip the network entirely. Bundled with four housekeeping items: a new `constants.ts` for named numeric constants, removal of the dead `sessionActive` variable in `index.ts`, deletion of stale `todo.md`, and conversion of all synchronous `fs` calls in `github-extract.ts` to `fs.promises`.

**Resolves:** #006 (session-level URL cache), #007 (cleanup pass)  
**Branch:** `feat/015-caching-cleanup`

---

## What Was Built

### URL Cache (`extract.ts`)

A module-level `Map<string, UrlCacheEntry>` stores the last successful result for each URL alongside the timestamp of the fetch. On every `extractContent()` call, the cache is consulted before any network I/O:

- **Hit within TTL (30 min):** return cached result immediately — zero network requests.
- **Miss or expired:** fetch normally, cache the result on success.
- **Errors are not cached:** non-recoverable errors and Jina fallback failures always let the next call retry the network.

The cache is session-scoped: `clearUrlCache()` (a new export) is called from `handleSessionStart` in `index.ts`, which fires on `session_start`, `session_switch`, `session_fork`, and `session_tree` events. Each new session therefore begins with a clean cache.

### Constants (`constants.ts`)

New file exporting two previously hard-coded numbers:

```ts
export const HTTP_FETCH_TIMEOUT_MS = 30_000;           // 30 s
export const URL_CACHE_TTL_MS = 30 * 60 * 1_000;      // 30 min
```

Both are imported and used in `extract.ts`; no raw `30000` literals remain in that file.

### Dead Code Removal (`index.ts`)

`sessionActive` was a module-level `boolean` set on session start/shutdown but never read anywhere. Three lines removed.

### Stale File Deletion

`todo.md` (one-time setup notes from project bootstrap) was deleted from the repository root.

### Async `fs` Conversion (`github-extract.ts`)

Every synchronous `fs` call has been replaced with its `fs.promises` equivalent:

| Sync (removed) | Async (added) |
|----------------|---------------|
| `existsSync` | `access` |
| `readFileSync` | `readFile` |
| `statSync` | `stat` |
| `readdirSync` | `readdir` |
| `rmSync` | `rm` |
| `openSync` / `readSync` / `closeSync` | `open` + `fileHandle.read` + `fileHandle.close` |

All affected functions (`isBinaryFile`, `buildTree`, `buildDirListing`, `readReadme`, `generateContent`, `execClone`, `cloneRepo`) became `async`. `clearCloneCache` remains synchronous, using fire-and-forget `rm(...).catch(() => {})` for cleanup.

---

## Why

- **URL cache:** The Haiku filter (issue #012) can answer new questions from already-fetched content without a second round-trip. Without caching, every re-fetch of a URL that was already retrieved within the session consumes network time and Exa quota unnecessarily.
- **`constants.ts`:** The two `30000` literals in `extract.ts` were magic numbers — not obviously 30 seconds and 30 minutes respectively. Named constants make the intent clear and provide a single place to tune timeouts.
- **`sessionActive` removal:** Dead code increases cognitive load when reading session lifecycle logic. Removing it makes `handleSessionStart` and `handleSessionShutdown` easier to reason about.
- **Async `fs`:** Synchronous `fs` calls block Node.js's event loop — a concern in an extension that handles multiple concurrent fetches. The async conversion eliminates this and aligns `github-extract.ts` with the rest of the codebase's I/O style.

---

## Files Changed

| File | Change |
|------|--------|
| `constants.ts` | **Created** — exports `HTTP_FETCH_TIMEOUT_MS` and `URL_CACHE_TTL_MS` |
| `extract.ts` | Added `urlCache` Map, `clearUrlCache()` export, TTL cache check; replaced raw `30000` literals |
| `github-extract.ts` | All sync `fs` → `fs.promises`; all affected functions made `async` |
| `index.ts` | Removed `sessionActive`; added `clearUrlCache()` import and call in `handleSessionStart` |
| `todo.md` | **Deleted** |
| `extract.test.ts` | Added 3 new cache tests (cache hit, TTL expiry, `clearUrlCache`) |
| `index.test.ts` | Added `session lifecycle > calls clearUrlCache on session_start` integration test |
| `github-extract.clone.test.ts` | Updated mock from `node:fs` → `node:fs/promises` |

---

## Test Coverage

- **Cache deduplication:** two calls to same URL → `mockFetch` called exactly once; both results are identical.
- **TTL expiry:** `vi.spyOn(Date, "now")` advances time past `URL_CACHE_TTL_MS` (1,800,001 ms) → second call triggers a fresh fetch.
- **`clearUrlCache`:** after clearing, next call re-fetches regardless of prior state.
- **Session wiring:** `session_start` handler calls `clearUrlCache` — verified via mock in `index.test.ts`.
- **Async conversion:** all 9 existing `github-extract.test.ts` tests and all 4 `github-extract.clone.test.ts` tests pass unchanged after the async conversion.

**Total:** 167 tests across 13 files — all pass.
