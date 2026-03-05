# Brainstorm: Caching & Cleanup (015)

Covers issues #006 (session-level URL cache) and #007 (cleanup pass).

## Approach

The URL cache lives as a module-level `Map` inside `extract.ts`, keyed by URL with a `{ content, fetchedAt }` entry. This is transparent to callers — `extractContent()` checks the cache before making a network request and populates it on miss. GitHub URLs are excluded (they already have `cloneCache`). The cache is cleared via an exported `clearUrlCache()` called in `index.ts`'s existing `onSessionStart` hook alongside `clearResults()`. TTL is 30 minutes. No `no-cache` parameter — the session boundary is the natural reset.

The cleanup is four independent mechanical changes: delete the unused `sessionActive` variable (3 lines in `index.ts`), delete the stale `todo.md`, create a `constants.ts` for the two values that need a canonical home (`HTTP_FETCH_TIMEOUT_MS` and `URL_CACHE_TTL_MS`), and convert the sync `fs` operations in `github-extract.ts` to their `fs.promises` equivalents. The `github-extract.ts` conversion touches `isBinaryFile`, `buildTree`, `buildDirListing`, `readReadme`, and the main function — all become async with `await` at each call site.

These two issues are independent — the cache and the cleanup don't touch each other. They're in the same batch for shipping convenience.

## Key Decisions

- **Cache in `extract.ts`** (not a separate module): it's an implementation detail of "how we fetch," not a user-facing concept. Module-level Map, cleared via exported `clearUrlCache()`.
- **No `no-cache` parameter**: YAGNI. Session start clears the cache, which is the natural and sufficient reset point.
- **`constants.ts` with two values**: `HTTP_FETCH_TIMEOUT_MS = 30_000` (raw number currently in `extract.ts`) and `URL_CACHE_TTL_MS = 30 * 60 * 1_000` (new). Leave `MAX_INLINE_CONTENT` in `index.ts` — it's deleted in 2.0.3 anyway.
- **Full async conversion of `github-extract.ts`**: all 8 sync ops → `fs.promises`. The main function is already async so this is mechanical; existing behavior unchanged.
- **Delete `todo.md`**: stale items reference one-time setup tasks. No replacement needed — ROADMAP.md is the source of truth.

## Components

- **`constants.ts`** (new): `HTTP_FETCH_TIMEOUT_MS`, `URL_CACHE_TTL_MS`
- **`extract.ts`** (modify): add `urlCache` Map + TTL check, export `clearUrlCache()`, import `HTTP_FETCH_TIMEOUT_MS` from constants
- **`index.ts`** (modify): call `clearUrlCache()` in `onSessionStart`, remove `sessionActive` dead code
- **`github-extract.ts`** (modify): convert all sync `fs` ops to async `fs.promises`
- **`todo.md`** (delete)

## Testing Strategy

- **URL cache — new tests in `extract.test.ts`**: (1) second fetch of same URL doesn't trigger another network call; (2) cached content is structurally identical to first fetch result; (3) TTL expiry causes cache miss (mock `Date.now()`); (4) `clearUrlCache()` causes cache miss on next call; (5) GitHub URLs bypass the cache.
- **`constants.ts`**: no dedicated tests — just values; TypeScript import catches regressions.
- **`github-extract.ts` async conversion**: existing tests are sufficient — behavior is unchanged, TypeScript enforces the async signature. No new tests needed.
- **Dead code removal**: TypeScript compilation catches references; no runtime tests needed.
