---
id: 4
title: retryFetch respects AbortSignal (pre-aborted and mid-backoff)
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - retry.test.ts
files_to_create: []
---

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
