---
id: 3
title: "Fix Bug #019 (part 2) — Update `index.ts` call site to pass domain
  filters to `findSimilarExa` and emit warning for unsupported filters"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Even after Task 2 adds domain-filter support to `findSimilarExa`, the `index.ts` call site still passes only `{ apiKey, numResults, signal, detail }` — so `includeDomains` and `excludeDomains` are destructured from `normalizeWebSearchInput` but never forwarded. Additionally, when a user provides `freshness` or `category` with `similarUrl`, those filters are silently dropped with no indication to the user.

This task:
1. Updates the `findSimilarExa` call in `index.ts` to pass `includeDomains` and `excludeDomains`.
2. Adds a user-visible warning note to the answer when `freshness` or `category` is provided with `similarUrl` (since `/findSimilar` does not support those filters).

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

---

**Step 1 — Write the failing tests**

Add the following three tests inside the existing `describe("web_search similarUrl routing", ...)` block in `index.test.ts` (after the last existing test in that block, at line 868):

```ts
// index.test.ts — add inside describe("web_search similarUrl routing")

it("passes includeDomains and excludeDomains to findSimilarExa when similarUrl is provided", async () => {
  exaState.findSimilarExa.mockResolvedValueOnce([]);
  exaState.formatSearchResults.mockReturnValue("No results found.");

  const { webSearchTool } = await getWebSearchTool();
  await webSearchTool.execute("call-domains", {
    similarUrl: "https://example.com",
    includeDomains: ["github.com"],
    excludeDomains: ["pinterest.com"],
  });

  expect(exaState.findSimilarExa).toHaveBeenCalledWith(
    "https://example.com",
    expect.objectContaining({
      includeDomains: ["github.com"],
      excludeDomains: ["pinterest.com"],
    })
  );
});

it("includes a warning note when freshness is used with similarUrl", async () => {
  exaState.findSimilarExa.mockResolvedValueOnce([]);
  exaState.formatSearchResults.mockReturnValue("No results found.");

  const { webSearchTool } = await getWebSearchTool();
  const result = await webSearchTool.execute("call-freshness-warn", {
    similarUrl: "https://example.com",
    freshness: "day",
  });

  const text = getText(result);
  expect(text).toMatch(/freshness.*not supported/i);
});

it("includes a warning note when category is used with similarUrl", async () => {
  exaState.findSimilarExa.mockResolvedValueOnce([]);
  exaState.formatSearchResults.mockReturnValue("No results found.");

  const { webSearchTool } = await getWebSearchTool();
  const result = await webSearchTool.execute("call-category-warn", {
    similarUrl: "https://example.com",
    category: "news",
  });

  const text = getText(result);
  expect(text).toMatch(/category.*not supported/i);
});
```

**Step 2 — Run test, verify it fails**

```
npx vitest run index.test.ts
```

Expected: FAIL — 3 failures:
- `AssertionError: expected "spy" to have been called with arguments: [ 'https://example.com', ObjectContaining({includeDomains: ["github.com"], …}) ]` (domain passthrough test)
- `AssertionError: expected '## Query: https://example.com\nNo results found.' to match /freshness.*not supported/i` (freshness warning test)
- `AssertionError: expected '## Query: https://example.com\nNo results found.' to match /category.*not supported/i` (category warning test)

**Step 3 — Write minimal implementation**

**`index.ts`** — update the `similarUrl` branch (around lines 200–230). Replace the block from `if (similarUrl) {` through the closing `}` of the try/catch (ending just before `} else {`):

```ts
if (similarUrl) {
  // findSimilar mode — single request, no pLimit loop
  const unsupportedFilters: string[] = [];
  if (maxAgeHours !== undefined) unsupportedFilters.push("freshness");
  if (category !== undefined) unsupportedFilters.push("category");
  const warningNote =
    unsupportedFilters.length > 0
      ? `Note: ${unsupportedFilters.join(", ")} filter${unsupportedFilters.length > 1 ? "s are" : " is"} not supported for similarUrl searches and was ignored.\n\n`
      : "";
  try {
    const searchResults = await findSimilarExa(similarUrl, {
      apiKey: config.exaApiKey,
      numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
      signal: combinedSignal,
      detail,
      includeDomains,
      excludeDomains,
    });
    const formatted = formatSearchResults(searchResults);
    successfulQueries++;
    totalResults += searchResults.length;
    results.push({
      query: similarUrl,
      answer: warningNote + formatted,
      results: searchResults.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      query: similarUrl,
      answer: "",
      results: [],
      error: msg,
    });
  }
```

**Step 4 — Run test, verify it passes**

```
npx vitest run index.test.ts
```

Expected: PASS — all tests in `index.test.ts` green.

**Step 5 — Verify no regressions**

```
npm test
```

Expected: all passing.
