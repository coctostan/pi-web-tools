---
id: 3
title: Add URL cache to extractContent — same URL within session returns cached result
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - extract.ts
  - extract.test.ts
files_to_create: []
---

Covers AC 1 and AC 2. Adds a module-level `urlCache` Map to `extract.ts`. `extractContent` checks the cache before fetching and stores successful results (error === null) after fetching. No TTL check yet — that comes in Task 4.

**Files:**
- Modify: `extract.ts`
- Test: `extract.test.ts`

**Step 1 — Write the failing test**

Add a new `it` block inside the existing `describe("extractContent", ...)` block in `extract.test.ts`:

```ts
it("returns cached result for same URL — single network request (no TTL check yet)", async () => {
  const html = `<!DOCTYPE html><html><head><title>Cache Test</title></head><body>
<article><h1>Cache Test</h1><p>${"body text ".repeat(100)}</p></article></body></html>`;

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      "content-length": String(html.length),
    }),
    text: async () => html,
  });

  const result1 = await extractContent("https://cache-dedup.example.com/page");
  const result2 = await extractContent("https://cache-dedup.example.com/page");

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(result2.url).toBe(result1.url);
  expect(result2.title).toBe(result1.title);
  expect(result2.content).toBe(result1.content);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`
Expected: FAIL — `AssertionError: expected spy to have been called 1 time, but was called 2 times`

**Step 3 — Write minimal implementation**

In `extract.ts`, add the following after the existing imports and constants (e.g., after `const NON_RECOVERABLE_ERRORS` and before `const MAX_SIZE`):

```ts
// ---------------------------------------------------------------------------
// URL cache (session-scoped, cleared via clearUrlCache on session start)
// ---------------------------------------------------------------------------

interface UrlCacheEntry {
  result: ExtractedContent;
  fetchedAt: number;
}

const urlCache = new Map<string, UrlCacheEntry>();
```

Modify `extractContent` to check the cache after URL validation and store successful results before returning. Replace the existing `extractContent` function body:

```ts
export async function extractContent(
  url: string,
  signal?: AbortSignal
): Promise<ExtractedContent> {
  // Check abort first
  if (signal?.aborted) {
    return makeErrorResult(url, "Aborted");
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return makeErrorResult(url, "Invalid URL");
  }

  // Check cache (no TTL check — Task 3; TTL added in Task 4)
  const cached = urlCache.get(url);
  if (cached) return cached.result;

  let httpResult: ExtractedContent;
  let httpError: string | null = null;

  try {
    httpResult = await extractViaHttp(url, signal);
    // If no error, cache and return
    if (!httpResult.error) {
      urlCache.set(url, { result: httpResult, fetchedAt: Date.now() });
      return httpResult;
    }
    // If non-recoverable, return directly (don't cache errors)
    if (NON_RECOVERABLE_ERRORS.includes(httpResult.error)) return httpResult;
    // Recoverable error — try Jina
    httpError = httpResult.error;
  } catch (err: unknown) {
    httpError = err instanceof Error ? err.message : String(err);
  }

  // Try Jina fallback
  const jinaResult = await extractViaJina(url, signal);
  if (jinaResult) {
    urlCache.set(url, { result: jinaResult, fetchedAt: Date.now() });
    return jinaResult;
  }

  // Jina also failed — return original error with helpful message
  const errorMsg = httpError
    ? `${httpError}. Jina Reader fallback also failed.`
    : "Failed to extract content";
  return makeErrorResult(url, errorMsg);
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass
