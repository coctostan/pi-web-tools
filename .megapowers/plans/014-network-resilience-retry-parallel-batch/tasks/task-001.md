---
id: 1
title: retryFetch retries on retryable HTTP status codes with exponential backoff
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - retry.ts
  - retry.test.ts
---

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
