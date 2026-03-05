---
id: 2
title: retryFetch retries on network errors (TypeError)
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - retry.test.ts
  - retry.ts
files_to_create: []
---

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
