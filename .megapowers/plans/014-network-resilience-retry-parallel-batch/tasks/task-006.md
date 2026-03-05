---
id: 6
title: searchContext uses retryFetch instead of raw fetch
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - exa-context.ts
  - exa-context.test.ts
files_to_create: []
---

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
