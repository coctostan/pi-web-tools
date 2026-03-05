# Feature: Network Resilience — Retry & Parallel Batch (#014)

**Roadmap:** 2.1.1 (reliability) + 2.1.2 (speed)  
**Issues:** #004 (retry backoff), #005 (parallel batch)  
**Branch:** `feat/014-network-resilience-retry-parallel-batch`

---

## What Was Built

### 1. `retryFetch()` — Generic Retry Utility (`retry.ts`)

A drop-in replacement for the global `fetch()` that transparently recovers from transient Exa API failures.

**Signature:**
```ts
retryFetch(
  input: string | URL | Request,
  init?: RequestInit,
  config?: RetryConfig       // { maxRetries?: number; initialDelayMs?: number }
): Promise<Response>
```

**Behaviour:**
- **Retryable statuses** (429, 500, 502, 503, 504): waits with exponential backoff (1s → 2s) and retries up to `maxRetries` times (default: 2).
- **Network errors** (`TypeError` with `"fetch failed"`, `"ECONNRESET"`, `"ETIMEDOUT"`): same backoff schedule.
- **Non-retryable statuses** (400, 401, 403, 404): returned immediately without retrying.
- **Pre-aborted `AbortSignal`**: throws instantly, no request made.
- **Signal fires during backoff**: clears the timer and rethrows the abort error.
- **After retry exhaustion**: throws the last network error, or returns the last error response.

### 2. Exa API Integration

`searchExa()` (`exa-search.ts`) and `searchContext()` (`exa-context.ts`) now use `retryFetch()` instead of raw `fetch()`. No change to their public APIs — callers are unaffected.

### 3. Parallel Batch Web Search (`index.ts`)

Batch `web_search` with multiple queries now executes them concurrently via `pLimit(3)` instead of sequentially:

```ts
const limit = pLimit(3);
const resultPromises = queryList.map((q) =>
  limit(async (): Promise<QueryResultData> => { ... })
);
results.push(...(await Promise.all(resultPromises)));
```

Per-query `try/catch` ensures a single failure doesn't abort the batch — the error is reported in-line and other queries proceed.

### 4. Bounded Multi-URL `fetch_content` Concurrency (`index.ts`)

Multi-URL `fetch_content` previously used unbounded `Promise.all`. It now uses `pLimit(3)` for bounded concurrency:

```ts
const limit = pLimit(3);
results = await Promise.all(dedupedUrls.map((url) => limit(() => fetchOne(url))));
```

---

## Why

| Problem | Impact | Fix |
|---------|--------|-----|
| Single 429/503 from Exa kills the request | Search fails for transient rate limits | `retryFetch()` silently recovers |
| Batch 3 queries run sequentially | 3× slower than necessary | `pLimit(3)` concurrent execution |
| Unbounded `Promise.all` on multi-URL fetch | Potential overload on many URLs | `pLimit(3)` caps concurrency |

---

## Files Changed

| File | Change |
|------|--------|
| `retry.ts` | **New** — `retryFetch()` utility |
| `retry.test.ts` | **New** — 14 unit tests (fake timers, all retry branches) |
| `exa-search.ts` | `fetch` → `retryFetch` |
| `exa-search.test.ts` | Retry integration tests (fake timers); existing 429 test hardened |
| `exa-context.ts` | `fetch` → `retryFetch` |
| `exa-context.test.ts` | Retry integration tests (fake timers) |
| `index.ts` | Sequential loop → `pLimit(3)`; unbounded `Promise.all` → `pLimit(3)` |
| `index.test.ts` | Tests for parallel batch and multi-URL concurrency |

---

## Test Coverage

- **14 unit tests** in `retry.test.ts` cover all AC: retryable codes, network errors, non-retryable codes, retry exhaustion, pre-abort, mid-backoff abort.
- **4 integration tests** in `exa-search.test.ts` and `exa-context.test.ts` confirm end-to-end wiring.
- **3 index tests** verify `pLimit(3)` is called, partial batch failure is isolated, and multi-URL uses bounded concurrency.
- All 163 tests pass in **< 1 second** (fake timers used throughout; no real delay in CI).
