---
id: 2
title: "Fix Bug #019 (part 1) — Forward `includeDomains`/`excludeDomains` in
  `findSimilarExa` and correct unsupported-param test assertions"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

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
