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
    const rejection = expect(promise).rejects.toThrow("fetch failed");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await rejection;
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

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
    const rejection = expect(promise).rejects.toThrow();
    // Abort during the backoff wait (before 1000ms completes)
    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only the initial request, no retry
  });
});
