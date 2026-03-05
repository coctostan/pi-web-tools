---
id: 3
title: retryFetch does not retry on non-retryable HTTP status codes
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - retry.test.ts
  - retry.ts
files_to_create: []
---

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
