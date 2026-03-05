---
id: 5
title: Export clearUrlCache() from extract.ts and verify it clears the cache
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - extract.ts
  - extract.test.ts
files_to_create: []
---

Covers AC 4 and AC 5. Exports `clearUrlCache()` from `extract.ts`. After calling it, the next `extractContent()` call for any previously-cached URL makes a fresh network request.

**Files:**
- Modify: `extract.ts`
- Test: `extract.test.ts`

**Step 1 — Write the failing test**

Update the import at the top of `extract.test.ts` to include `clearUrlCache`:

```ts
import { extractContent, extractHeadingTitle, fetchAllContent, clearUrlCache } from "./extract.js";
```

Add a new `it` block inside the existing `describe("extractContent", ...)` block:

```ts
it("clearUrlCache() causes next call to make a fresh network request", async () => {
  const html = `<!DOCTYPE html><html><head><title>Clear Test</title></head><body>
<article><h1>Clear Test</h1><p>${"body ".repeat(100)}</p></article></body></html>`;

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      "content-length": String(html.length),
    }),
    text: async () => html,
  });

  const url = "https://clear-cache.example.com/page";

  // First fetch — caches result
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // Clear the cache
  clearUrlCache();

  // Second fetch — cache miss, must re-fetch
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`
Expected: FAIL — module import error for missing named export `clearUrlCache` from `"./extract.js"` (e.g., "does not provide an export named 'clearUrlCache'" / "No matching export")

(Vitest fails at module-load/import time because `clearUrlCache` is not yet exported from `extract.ts`; this is not a `tsc` diagnostic.)

**Step 3 — Write minimal implementation**

Add the following export to `extract.ts`, immediately after the `urlCache` Map declaration:

```ts
export function clearUrlCache(): void {
  urlCache.clear();
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass
