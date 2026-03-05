# Spec: Network Resilience — Retry & Parallel Batch

## Goal

Add network resilience and speed to pi-web-tools by (1) wrapping Exa API `fetch()` calls with a generic retry-with-backoff utility that transparently recovers from transient failures, and (2) replacing sequential batch query execution with bounded parallel concurrency using `p-limit(3)`.

## Acceptance Criteria

**Retry utility (`retry.ts`)**

1. `retryFetch()` accepts the same arguments as `fetch()` plus an optional config object with `maxRetries` (default: 2) and `initialDelayMs` (default: 1000).
2. On a retryable HTTP status (429, 500, 502, 503, 504), `retryFetch()` waits with exponential backoff (1s → 2s) and retries the request.
3. On a network error (`TypeError` with message containing `'fetch failed'`, `'ECONNRESET'`, or `'ETIMEDOUT'`), `retryFetch()` retries with the same backoff schedule.
4. On a non-retryable HTTP status (400, 401, 403, 404), `retryFetch()` returns the error response immediately without retrying.
5. After exhausting all retries, `retryFetch()` throws the last error (or returns the last error response).
6. If the `AbortSignal` passed to `retryFetch()` is already aborted, it throws immediately without making any request.
7. If the `AbortSignal` fires during a backoff wait, `retryFetch()` stops waiting and throws an abort error.

**Exa integration**

8. `searchExa()` in `exa-search.ts` uses `retryFetch()` instead of raw `fetch()`.
9. `searchContext()` in `exa-context.ts` uses `retryFetch()` instead of raw `fetch()`.

**Parallel batch queries**

10. Batch `web_search` with multiple queries executes them concurrently via `p-limit(3)`, not sequentially.
11. If one query in a batch fails, the other queries still complete and the failure is reported in the results array.
12. Multi-URL `fetch_content` uses `p-limit(3)` for bounded concurrency instead of unbounded `Promise.all`.

**Regression**

13. All existing tests continue to pass with no modifications.

## Out of Scope

- Retry logic for non-Exa network calls (e.g., Jina extraction, GitHub cloning)
- Configurable retry settings via `web-tools.json`
- Circuit breaker or rate-limit queuing patterns
- Retry on `fetch_content` page extraction failures

## Open Questions

None.
