# Plan

### Task 1: Fix Bug #018 — Change FRESHNESS_MAP `realtime` from 0 to 1

Fix `FRESHNESS_MAP` so `"realtime"` maps to `1` (last 1 hour) instead of `0` (which Exa treats as "no filter" — identical to omitting `maxAgeHours` entirely).

**Files:**
- Modify: `tool-params.ts`
- Test: `tool-params.test.ts`

---

**Step 1 — Write the failing test**

The failing test is already present in `tool-params.test.ts` at lines 98–103. Do not add it again — it is reproduced here for reference:

```ts
// tool-params.test.ts — already in file at lines 98-103
it("BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0 (Exa ignores 0 as no-filter)", () => {
  const result = normalizeWebSearchInput({ query: "x", freshness: "realtime" });
  // maxAgeHours: 0 is treated by Exa identically to omitting the field (no filtering).
  // 'realtime' should either be removed from the enum or map to a small positive value.
  expect(result.maxAgeHours).not.toBe(0);
});
```

**Step 2 — Run test, verify it fails**

```
npx vitest run tool-params.test.ts
```

Expected: FAIL — `AssertionError: expected +0 not to be +0 // Object.is equality`

**Step 3 — Write minimal implementation**

**`tool-params.ts` line 11** — change `realtime: 0` to `realtime: 1`:

```ts
const FRESHNESS_MAP: Record<string, number | undefined> = { realtime: 1, day: 24, week: 168, any: undefined };
```

**`tool-params.test.ts` lines 93–96** — update the old test that asserted `0` (it now contradicts the fix; update it to document the new behavior):

```ts
it("normalizeWebSearchInput maps freshness 'realtime' to maxAgeHours 1 (last 1 hour)", () => {
  const result = normalizeWebSearchInput({ query: "x", freshness: "realtime" });
  expect(result.maxAgeHours).toBe(1);
});
```

No other changes needed — the `BUG #018` test at lines 98–103 passes automatically once `FRESHNESS_MAP.realtime` is `1`.

**Step 4 — Run test, verify it passes**

```
npx vitest run tool-params.test.ts
```

Expected: PASS — all tests in `tool-params.test.ts` green.

**Step 5 — Verify no regressions**

```
npm test
```

Expected: all passing.

### Task 2: Fix Bug #019 (part 1) — Forward `includeDomains`/`excludeDomains` in `findSimilarExa` and correct unsupported-param test assertions

`findSimilarExa` in `exa-search.ts` builds its request body and immediately calls `JSON.stringify` with no filter block — unlike `searchExa` which appends `includeDomains`, `excludeDomains`, `category`, and `maxAgeHours` after building the base body.

This task:
1. Adds the filter block for `includeDomains` and `excludeDomains` (both are supported by the Exa `/findSimilar` endpoint per its OpenAPI spec).
2. Corrects the two existing BUG #019 test assertions for `maxAgeHours` and `category` — those fields are **not supported** by `/findSimilar` and must not be forwarded; the assertions that expected them to appear in the body are incorrect and need to document the real intended behavior.

**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`

---

**Step 1 — Write the failing tests**

The following failing tests are already present in `exa-search.test.ts` (lines 537–561). Do not add them again — reproduced here for reference:

```ts
// exa-search.test.ts — already in file at lines 537-548
it("BUG #019: sends includeDomains in request body when provided", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await findSimilarExa("https://example.com", { apiKey: "key", includeDomains: ["github.com"] });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  // Currently includeDomains is silently dropped — this assertion will FAIL until fixed
  expect(body.includeDomains).toEqual(["github.com"]);
});

// exa-search.test.ts — already in file at lines 550-561
it("BUG #019: sends excludeDomains in request body when provided", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await findSimilarExa("https://example.com", { apiKey: "key", excludeDomains: ["pinterest.com"] });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  // Currently excludeDomains is silently dropped — this assertion will FAIL until fixed
  expect(body.excludeDomains).toEqual(["pinterest.com"]);
});
```

**Step 2 — Run test, verify it fails**

```
npx vitest run exa-search.test.ts
```

Expected: FAIL — `AssertionError: expected undefined to deeply equal [ 'github.com' ]` (at exa-search.test.ts:547)

**Step 3 — Write minimal implementation**

**`exa-search.ts`** — add domain filter block between the `requestBody` closing brace (line 163) and `JSON.stringify` (line 165) in the `findSimilarExa` function:

```ts
// exa-search.ts — insert after line 163 (the closing `};` of requestBody),
// before `const body = JSON.stringify(requestBody);`
if (options.includeDomains && options.includeDomains.length > 0) {
  requestBody.includeDomains = options.includeDomains;
}
if (options.excludeDomains && options.excludeDomains.length > 0) {
  requestBody.excludeDomains = options.excludeDomains;
}
```

**`exa-search.test.ts`** — update the two BUG #019 tests that incorrectly expected `maxAgeHours` and `category` to be forwarded (these fields are NOT supported by `/findSimilar` per the Exa OpenAPI spec; they must NOT appear in the request body):

Replace the `maxAgeHours` test (lines 524–535):
```ts
it("findSimilarExa does NOT forward maxAgeHours to /findSimilar (endpoint does not support it)", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await findSimilarExa("https://example.com", { apiKey: "key", maxAgeHours: 24 });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  // maxAgeHours is a ContentsRequest field (livecrawl control), not a CommonRequest filter.
  // /findSimilar uses CommonRequest — maxAgeHours must NOT appear in the request body.
  expect(body.maxAgeHours).toBeUndefined();
});
```

Replace the `category` test (lines 563–574):
```ts
it("findSimilarExa does NOT forward category to /findSimilar (endpoint does not support it)", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await findSimilarExa("https://example.com", { apiKey: "key", category: "news" });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  // category is a search-specific field, not in CommonRequest.
  // /findSimilar uses CommonRequest — category must NOT appear in the request body.
  expect(body.category).toBeUndefined();
});
```

**Step 4 — Run test, verify it passes**

```
npx vitest run exa-search.test.ts
```

Expected: PASS — all tests in `exa-search.test.ts` green (the two domain tests now pass; the two unsupported-param tests pass with the corrected assertions).

**Step 5 — Verify no regressions**

```
npm test
```

Expected: all passing.

### Task 3: Fix Bug #019 (part 2) — Update `index.ts` call site to pass domain filters to `findSimilarExa` and emit warning for unsupported filters [depends: 2]

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

### Task 4: Update README to document corrected `realtime` freshness value and `similarUrl` filter support [no-test] [depends: 1, 3]

Documentation-only task. Update the `README.md` to reflect:
1. `freshness: "realtime"` now maps to `maxAgeHours: 1` (last 1 hour) — not `0h` as previously documented.
2. `similarUrl` supports `includeDomains` and `excludeDomains` but NOT `freshness` or `category`; using the latter two will produce a warning note.

**Justification:** documentation — no observable behavior change, pure doc update to match the fixes in Tasks 1 and 3.

**Files:**
- Modify: `README.md`

---

**Step 1 — Make the change**

**`README.md` line 90** — update the `freshness` table row to correct `"realtime"` description from `0h` to `last 1 hour`:

Old:
```
| `freshness` | string | `"realtime"`, `"day"`, `"week"`, or `"any"` (default) |
```

New:
```
| `freshness` | string | `"realtime"` (last 1 hour), `"day"` (last 24h), `"week"` (last 168h), or `"any"` (default, no filter) |
```

**`README.md` line 94** — update the `similarUrl` table row to document supported/unsupported filters:

Old:
```
| `similarUrl` | string | Find pages similar to this URL (alternative to `query`) |
```

New:
```
| `similarUrl` | string | Find pages similar to this URL (alternative to `query`). Supports `includeDomains` and `excludeDomains`. Note: `freshness` and `category` are not supported and will produce a warning. |
```

**Step 2 — Verify**

```
npm test
```

Expected: all passing (no test changes, just documentation).
