# Brainstorm: Network Resilience — Retry & Parallel Batch

## Approach

Add network resilience to pi-web-tools through two independent improvements: retry with exponential backoff for Exa API calls, and parallel execution for batch search queries.

A new `retry.ts` module provides a generic `retryFetch()` function that wraps `fetch()` with configurable retry logic — max 2 retries, exponential backoff (1s → 2s). It's Exa-agnostic: it only knows about HTTP status codes and network errors. Both `searchExa()` in `exa-search.ts` and `searchContext()` in `exa-context.ts` replace their raw `fetch()` calls with `retryFetch()`, gaining transparent recovery from transient failures (429, 500, 502, 503, 504, network errors) without any changes to their callers.

For parallelism, the sequential `for` loop over batch queries in `index.ts` is replaced with `p-limit(3)` concurrency — the same pattern already used by `fetchAllContent`. Multi-URL `fetch_content` also gets `p-limit(3)` instead of unbounded `Promise.all`. No new dependencies needed; `p-limit` is already in `package.json`.

## Key Decisions

- **Separate `retry.ts` module** — reusable across Exa callers and future search providers; clean TDD boundary
- **Max 2 retries with exponential backoff (1s → 2s)** — recovers most transient failures without adding meaningful latency
- **Retry on 429, 500, 502, 503, 504, network errors** — these are transient. Don't retry 400/401/403 (caller bugs/auth) or abort signals (intentional cancellation)
- **`p-limit(3)` for batch queries** — matches existing `fetchAllContent` pattern; 3 concurrent requests is reasonable for Exa rate limits
- **`p-limit(3)` for multi-URL `fetch_content`** — replaces unbounded `Promise.all` with bounded concurrency
- **No new dependencies** — `p-limit` already exists; retry is pure logic (~30 lines)

## Components

| Component | Change | Purpose |
|-----------|--------|---------|
| `retry.ts` (new) | Create | Generic fetch-with-retry utility |
| `retry.test.ts` (new) | Create | Isolated retry logic tests |
| `exa-search.ts` | Modify | `searchExa()` uses `retryFetch()` instead of `fetch()` |
| `exa-context.ts` | Modify | `searchContext()` uses `retryFetch()` instead of `fetch()` |
| `index.ts` | Modify | Batch `web_search` uses `p-limit(3)`; multi-URL `fetch_content` uses `p-limit(3)` |

## Testing Strategy

**`retry.ts` — isolated, no network:**
- Mock `fetch` to fail N times then succeed → verify retry count and return value
- Mock 429 response → retries; mock 400 → throws immediately
- Network error (`TypeError('fetch failed')`) → retries
- Verify backoff delays (1s, 2s) via fake timers or argument verification
- Already-aborted `AbortSignal` → throws immediately, no retry
- Abort mid-retry → stops and throws abort error

**`exa-search.ts` + `exa-context.ts` integration:**
- Verify `searchExa()` and `searchContext()` delegate to `retryFetch`

**Parallel batch in `index.ts`:**
- Batch `web_search` with 3 queries: verify concurrent execution (not sequential)
- One query fails in batch: other queries still succeed, failure reported in results
- Multi-URL `fetch_content`: verify concurrency bounded by `p-limit(3)`

**All tests mock network calls** — no Exa API key needed, consistent with existing 110-test suite.
