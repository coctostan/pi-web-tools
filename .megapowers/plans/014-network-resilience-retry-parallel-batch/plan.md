# Plan

### Task 1: retryFetch retries on retryable HTTP status codes with exponential backoff

Covers spec AC 1, 2, 5.

**Step 1 — Write the failing test**

Create `retry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { retryFetch } from "./retry.js";

describe("retryFetch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries on 429 with exponential backoff and returns success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: "ok" }) });

    const promise = retryFetch("https://api.example.com", {
      method: "POST",
      body: "test",
    });

    // Advance past first backoff (1000ms)
    await vi.advanceTimersByTimeAsync(1000);
    // Advance past second backoff (2000ms)
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on 500, 502, 503, 504", async () => {
    for (const status of [500, 502, 503, 504]) {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({ ok: false, status })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const promise = retryFetch("https://api.example.com");
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }
  });

  it("returns last error response after exhausting retries", async () => {
    mockFetch
      .mockResolvedValue({ ok: false, status: 503 });

    const promise = retryFetch("https://api.example.com", {}, { maxRetries: 2 });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("uses default config of maxRetries=2, initialDelayMs=1000", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = retryFetch("https://api.example.com");

    // Should need exactly 1000ms for first retry
    await vi.advanceTimersByTimeAsync(999);
    expect(mockFetch).toHaveBeenCalledTimes(1); // not retried yet
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run retry.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./retry.js"` or `TypeError: retryFetch is not a function`

**Step 3 — Write minimal implementation**

Create `retry.ts`:

```typescript
export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
      }, { once: true });
    }
  });
}
export async function retryFetch(
  input: string | URL | Request,
  init?: RequestInit,
  config?: RetryConfig
): Promise<Response> {
  const maxRetries = config?.maxRetries ?? 2;
  const initialDelayMs = config?.initialDelayMs ?? 1000;
  const signal = init?.signal ?? undefined;
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      await delay(delayMs, signal);
    }

    try {
      const response = await fetch(input, init);
      // Baseline for Task 1: retry non-OK responses with backoff.
      // Task 3 will narrow this to retryable status codes only.
      if (!response.ok && attempt < maxRetries) {
        lastResponse = response;
        continue;
      }
      return response;
    } catch (err) {
      // Baseline for Task 1: throw fetch errors immediately.
      // Task 2 will add retry behavior for retryable network errors.
      const lastError = err instanceof Error ? err : new Error(String(err));
      throw lastError;
    }
  }
  return lastResponse!;
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run retry.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: all passing

### Task 2: retryFetch retries on network errors (TypeError) [depends: 1]

Covers spec AC 3.
**Step 1 — Write the failing test**

Add to `retry.test.ts` inside the existing `describe("retryFetch", ...)` block:

```typescript
  it("retries on TypeError with 'fetch failed'", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = retryFetch("https://api.example.com").catch(() => null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result?.ok).toBe(true);
  });
  it("retries on TypeError with 'ECONNRESET'", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("ECONNRESET"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = retryFetch("https://api.example.com").catch(() => null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result?.ok).toBe(true);
  });
  it("retries on TypeError with 'ETIMEDOUT'", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("ETIMEDOUT"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = retryFetch("https://api.example.com").catch(() => null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result?.ok).toBe(true);
  });
  it("throws network error after exhausting retries", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    const promise = retryFetch("https://api.example.com", {}, { maxRetries: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow("fetch failed");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run retry.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called 2 times, but got 1 times`

Why this fails now: Task 1 baseline throws fetch errors immediately and does not retry `TypeError` network failures yet.

**Step 3 — Write minimal implementation**

Update `retry.ts`. Replace the full `retryFetch` function with:

```typescript
export async function retryFetch(
  input: string | URL | Request,
  init?: RequestInit,
  config?: RetryConfig
): Promise<Response> {
  const maxRetries = config?.maxRetries ?? 2;
  const initialDelayMs = config?.initialDelayMs ?? 1000;
  const signal = init?.signal ?? undefined;

  let lastResponse: Response | undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      await delay(delayMs, signal);
    }

    try {
      const response = await fetch(input, init);

      if (!response.ok && attempt < maxRetries) {
        lastResponse = response;
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) {
        throw lastError;
      }

      const isNetworkError =
        lastError instanceof TypeError &&
        (lastError.message.includes("fetch failed") ||
         lastError.message.includes("ECONNRESET") ||
         lastError.message.includes("ETIMEDOUT"));

      if (!isNetworkError) {
        throw lastError;
      }
    }
  }

  return lastResponse!;
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run retry.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 3: retryFetch does not retry on non-retryable HTTP status codes [depends: 2]

Covers spec AC 4.
**Step 1 — Write the failing test**

Add to `retry.test.ts` inside the existing `describe("retryFetch", ...)` block:

```typescript
  it("returns 400 immediately without retrying", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
    const result = await retryFetch("https://api.example.com");
    expect(result.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it("returns 401 immediately without retrying", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const result = await retryFetch("https://api.example.com");
    expect(result.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it("returns 403 immediately without retrying", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const result = await retryFetch("https://api.example.com");
    expect(result.status).toBe(403);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it("returns 404 immediately without retrying", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await retryFetch("https://api.example.com");
    expect(result.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run retry.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called 1 times, but got 3 times`

Why this fails now: after Task 2, `retryFetch` still retries any non-OK response. This task adds explicit non-retryable status short-circuiting.

**Step 3 — Write minimal implementation**

Update `retry.ts` by adding `NON_RETRYABLE_STATUS_CODES` and using status-specific branches in `retryFetch`.

Replace `retry.ts` with:

```typescript
export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
      }, { once: true });
    }
  });
}

export async function retryFetch(
  input: string | URL | Request,
  init?: RequestInit,
  config?: RetryConfig
): Promise<Response> {
  const maxRetries = config?.maxRetries ?? 2;
  const initialDelayMs = config?.initialDelayMs ?? 1000;
  const signal = init?.signal ?? undefined;

  let lastResponse: Response | undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      await delay(delayMs, signal);
    }

    try {
      const response = await fetch(input, init);

      if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        lastResponse = response;
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) {
        throw lastError;
      }

      const isNetworkError =
        lastError instanceof TypeError &&
        (lastError.message.includes("fetch failed") ||
         lastError.message.includes("ECONNRESET") ||
         lastError.message.includes("ETIMEDOUT"));

      if (!isNetworkError) {
        throw lastError;
      }
    }
  }

  return lastResponse!;
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run retry.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 4: retryFetch respects AbortSignal (pre-aborted and mid-backoff) [depends: 3]

Covers spec AC 6, 7.

**Step 1 — Write the failing test**

Add to `retry.test.ts` inside the existing `describe("retryFetch", ...)` block:

```typescript
  it("throws immediately when AbortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      retryFetch("https://api.example.com", { signal: controller.signal })
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("aborts during backoff wait and throws abort error", async () => {
    const controller = new AbortController();

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 });

    const promise = retryFetch("https://api.example.com", { signal: controller.signal });

    // Abort during the backoff wait (before 1000ms completes)
    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only the initial request, no retry
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run retry.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to not be called at all, but it was called 1 times`

**Step 3 — Write minimal implementation**

Update `retry.ts` by adding an early-abort guard at the top of `retryFetch`, immediately after `const signal = init?.signal ?? undefined;`. Do not replace the rest of the function.
```typescript
if (signal?.aborted) {
  throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run retry.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: all passing

### Task 5: searchExa uses retryFetch instead of raw fetch [depends: 1]

Covers spec AC 8.

**Step 1 — Write the failing test**

Add to `exa-search.test.ts`:

1. In the existing `it("handles API errors with status code in message", ...)` test, change the 429 fixture to be retry-safe across all retry attempts:

```typescript
mockFetch.mockResolvedValue({
  ok: false,
  status: 429,
  text: async () => "Rate limit exceeded. Please try again later.",
});
```

Keep the existing assertion unchanged:

```typescript
await expect(searchExa("test query", { apiKey: "test-key" })).rejects.toThrow("429");
```

This fixture adjustment is required so Step 4 (`npx vitest run exa-search.test.ts`) and Step 5 (`npx vitest run`) remain green after retry integration.

2. Add this new `describe` block at the end of the outer `describe("exa-search", ...)` block:

```typescript
  describe("retry integration", () => {
    it("retries on 429 and succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ title: "Result", url: "https://example.com", summary: "A result" }],
          }),
        });

      const results = await searchExa("test query", { apiKey: "test-key" });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Result");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    it("retries on 503 and succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "service unavailable" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ title: "Result", url: "https://example.com", summary: "A result" }],
          }),
        });

      const results = await searchExa("test query", { apiKey: "test-key" });
      expect(results).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-search.test.ts`
Expected: FAIL — The current `searchExa` uses raw `fetch()`, so a 429 response triggers the `!response.ok` branch which throws `Exa API error (429)` immediately without retrying. The test expects a retry and successful second attempt.

**Step 3 — Write minimal implementation**

Modify `exa-search.ts`:

1. Add import at the top:
```typescript
import { retryFetch } from "./retry.js";
```

2. Replace the `fetch()` call (lines 110-118) with `retryFetch()`:

Change:
```typescript
    response = await fetch(EXA_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
```

To:
```typescript
    response = await retryFetch(EXA_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: all passing

### Task 6: searchContext uses retryFetch instead of raw fetch [depends: 3]

Covers spec AC 9.

**Step 1 — Write the failing test**

Add to `exa-context.test.ts` inside the existing `describe("exa-context", ...)` block:

```typescript
  it("retries on 429 and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "some markdown content" }),
      });

    const result = await searchContext("test query", { apiKey: "test-key" });
    expect(result.content).toBe("some markdown content");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on network error and succeeds", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "recovered content" }),
      });

    const result = await searchContext("test query", { apiKey: "test-key" });
    expect(result.content).toBe("recovered content");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-context.test.ts`
Expected: FAIL — `Error: Exa Context API error (429)` for the 429 test, and `Error: Context request failed for query "test query"` for the network-error test.

**Step 3 — Write minimal implementation**

Modify `exa-context.ts`:

1. Add import at the top:
```typescript
import { retryFetch } from "./retry.js";
```

2. Replace the `fetch()` call (lines 35-43) with `retryFetch()`:

Change:
```typescript
    response = await fetch(EXA_CONTEXT_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
```

To:
```typescript
    response = await retryFetch(EXA_CONTEXT_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-context.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: all passing

### Task 7: Batch web_search executes queries concurrently via p-limit(3)

Covers spec AC 10, 11.
**Step 1 — Write the failing test**

Add to `index.test.ts` inside the existing `describe("web_search detail passthrough", ...)` block:

```typescript
  it("batch queries run concurrently via p-limit(3)", async () => {
    let seenConcurrency: number | undefined;
    pLimitState.pLimitSpy.mockImplementation((concurrency: number) => {
      seenConcurrency = concurrency;
      return <T>(fn: () => Promise<T>) => fn();
    });
    exaState.searchExa.mockResolvedValue([
      { title: "Result", url: "https://example.com", snippet: "test" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted result");
    const { webSearchTool } = await getWebSearchTool();
    await webSearchTool.execute("call-batch", {
      queries: ["query1", "query2", "query3"],
    });
    expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
    expect(seenConcurrency).toBe(3);
    expect(exaState.searchExa).toHaveBeenCalledTimes(3);
  });
  it("batch query partial failure reports error and continues other queries", async () => {
    pLimitState.pLimitSpy.mockImplementation((_concurrency: number) => {
      return <T>(fn: () => Promise<T>) => fn();
    });
    exaState.searchExa
      .mockResolvedValueOnce([{ title: "Result 1", url: "https://example.com/1", snippet: "s1" }])
      .mockRejectedValueOnce(new Error("Exa API error (503)"))
      .mockResolvedValueOnce([{ title: "Result 3", url: "https://example.com/3", snippet: "s3" }]);
    exaState.formatSearchResults
      .mockReturnValueOnce("Result 1 formatted")
      .mockReturnValueOnce("Result 3 formatted");
    const { webSearchTool } = await getWebSearchTool();
    const result = await webSearchTool.execute("call-partial", {
      queries: ["q1", "q2", "q3"],
    });
    const text = getText(result);
    expect(text).toContain("## Query: q1");
    expect(text).toContain("Result 1 formatted");
    expect(text).toContain("## Query: q2");
    expect(text).toContain("Error: Exa API error (503)");
    expect(text).toContain("## Query: q3");
    expect(text).toContain("Result 3 formatted");
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called with arguments: [ 3 ]`
Why this fails now: `web_search` still uses a sequential `for` loop and never calls `pLimit(3)`.

**Step 3 — Write minimal implementation**

Modify `index.ts` in the `web_search` tool `execute` method. Replace the sequential loop with bounded concurrency.

Replace:

```typescript
        for (const q of queryList) {
          try {
            const searchResults = await searchExa(q, {
              apiKey: config.exaApiKey,
              numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
              type,
              category,
              includeDomains,
              excludeDomains,
              signal: combinedSignal,
              detail,
            });
            const formatted = formatSearchResults(searchResults);
            results.push({
              query: q,
              answer: formatted,
              results: searchResults.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet,
              })),
              error: null,
            });
            successfulQueries++;
            totalResults += searchResults.length;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({
              query: q,
              answer: "",
              results: [],
              error: msg,
            });
          }
        }
```

With:

```typescript
        const limit = pLimit(3);
        const resultPromises = queryList.map((q) =>
          limit(async (): Promise<QueryResultData> => {
            try {
              const searchResults = await searchExa(q, {
                apiKey: config.exaApiKey,
                numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
                type,
                category,
                includeDomains,
                excludeDomains,
                signal: combinedSignal,
                detail,
              });
              const formatted = formatSearchResults(searchResults);
              successfulQueries++;
              totalResults += searchResults.length;
              return {
                query: q,
                answer: formatted,
                results: searchResults.map((r) => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.snippet,
                })),
                error: null,
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                query: q,
                answer: "",
                results: [],
                error: msg,
              };
            }
          })
        );
        results.push(...(await Promise.all(resultPromises)));
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

### Task 8: Multi-URL fetch_content uses p-limit(3) for bounded concurrency

Covers spec AC 12.
**Step 1 — Write the failing test**

Add to `index.test.ts` inside an existing fetch-content describe block (for example, `describe("fetch_content file-first storage", ...)`).

```typescript
  it("multi-URL fetch uses p-limit(3) for bounded concurrency", async () => {
    let fetchPLimitConcurrency: number | undefined;
    pLimitState.pLimitSpy.mockImplementation((concurrency: number) => {
      fetchPLimitConcurrency = concurrency;
      return <T>(fn: () => Promise<T>) => fn();
    });

    state.extractContent.mockImplementation(async (url: string) => ({
      url,
      title: `Title for ${url}`,
      content: `Content for ${url}`,
      error: null,
    }));

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

    await fetchContentTool.execute(
      "call-multi",
      { urls: ["https://example.com/1", "https://example.com/2", "https://example.com/3"] },
      undefined,
      undefined,
      ctx
    );

    expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
    expect(fetchPLimitConcurrency).toBe(3);
    expect(state.extractContent).toHaveBeenCalledTimes(3);
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called with arguments: [ 3 ]`

Why this fails now: the multi-URL branch in `fetch_content` still uses `Promise.all(dedupedUrls.map(fetchOne))` without `pLimit`.

**Step 3 — Write minimal implementation**

Modify `index.ts` in the multi-URL branch of `fetch_content`.

Change:

```typescript
        let results: ExtractedContent[];
        if (dedupedUrls.length === 1) {
          results = [await fetchOne(dedupedUrls[0])];
        } else {
          results = await Promise.all(dedupedUrls.map(fetchOne));
        }
```

To:

```typescript
        let results: ExtractedContent[];
        if (dedupedUrls.length === 1) {
          results = [await fetchOne(dedupedUrls[0])];
        } else {
          const limit = pLimit(3);
          results = await Promise.all(dedupedUrls.map((url) => limit(() => fetchOne(url))));
        }
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
