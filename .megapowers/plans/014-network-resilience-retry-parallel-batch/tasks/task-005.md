---
id: 5
title: searchExa uses retryFetch instead of raw fetch
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

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
