---
id: 4
title: Add TTL expiry to URL cache — stale entries cause fresh network request
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - extract.ts
  - extract.test.ts
files_to_create: []
---

Covers AC 3 and AC 10. Imports `URL_CACHE_TTL_MS` from `constants.ts` and adds a TTL check to the cache lookup. A cache entry older than `URL_CACHE_TTL_MS` (30 minutes) is treated as a miss.

**Files:**
- Modify: `extract.ts`
- Test: `extract.test.ts`

**Step 1 — Write the failing test**

Add a new `it` block inside the existing `describe("extractContent", ...)` block in `extract.test.ts`. Also update the `afterEach` at the top of the describe block to add `vi.restoreAllMocks()`:

```ts
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks(); // restore Date.now spy
});
```

Then add the test:

```ts
it("treats cached entry as stale after URL_CACHE_TTL_MS has elapsed", async () => {
  const html = `<!DOCTYPE html><html><head><title>TTL Test</title></head><body>
<article><h1>TTL Test</h1><p>${"body ".repeat(100)}</p></article></body></html>`;

  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      "content-length": String(html.length),
    }),
    text: async () => html,
  });

  const url = "https://ttl-test.example.com/page";

  // First fetch — caches result at now=0
  now = 0;
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // Advance time past TTL (30 min + 1 ms = 1_800_001 ms)
  now = 1_800_001;
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`
Expected: FAIL — `AssertionError: expected spy to have been called 2 times, but was called 1 time`

(With Task 3's implementation, the cache has no TTL check — the second call at `now=1_800_001` still hits the cache, so `mockFetch` is called only once.)

**Step 3 — Write minimal implementation**

1. Add `URL_CACHE_TTL_MS` to the import at the top of `extract.ts`:

```ts
import { HTTP_FETCH_TIMEOUT_MS, URL_CACHE_TTL_MS } from "./constants.js";
```

2. In `extractContent`, replace the cache lookup with a TTL-aware check:

```ts
// BEFORE (Task 3):
const cached = urlCache.get(url);
if (cached) return cached.result;

// AFTER (Task 4):
const cached = urlCache.get(url);
if (cached && Date.now() - cached.fetchedAt < URL_CACHE_TTL_MS) return cached.result;
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass
