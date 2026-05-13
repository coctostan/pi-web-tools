---
id: 3
title: Derive maxAgeHours at the Exa search boundary
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

### Task 3: Derive maxAgeHours at the Exa search boundary [depends: 1, 2]

**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`

**Step 1 — Write the failing test**
In `exa-search.test.ts`, replace the existing `maxAgeHours` request-body tests with these tests:

```ts
it("derives maxAgeHours from canonical freshness in /search requests", async () => {
  const cases = [
    ["realtime", 1],
    ["day", 24],
    ["week", 168],
  ] as const;

  for (const [freshness, expectedMaxAgeHours] of cases) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await searchExa("test", { apiKey: "key", freshness });

    const body = JSON.parse(mockFetch.mock.calls.at(-1)![1].body);
    expect(body.maxAgeHours).toBe(expectedMaxAgeHours);
    expect(body.maxAgeHours).not.toBe(0);
  }
});

it("omits maxAgeHours from /search requests for any or omitted freshness", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
  await searchExa("test", { apiKey: "key", freshness: "any" });
  let body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.maxAgeHours).toBeUndefined();

  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
  await searchExa("test", { apiKey: "key" });
  body = JSON.parse(mockFetch.mock.calls[1][1].body);
  expect(body.maxAgeHours).toBeUndefined();
});
```

Also update the existing `/findSimilar` unsupported maxAgeHours test to pass `freshness: "day"` instead of `maxAgeHours: 24`:

```ts
it("findSimilarExa does NOT forward freshness-derived maxAgeHours to /findSimilar (endpoint does not support it)", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await findSimilarExa("https://example.com", { apiKey: "key", freshness: "day" });
  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.maxAgeHours).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run exa-search.test.ts -t "derives maxAgeHours from canonical freshness"`
Expected: FAIL — `AssertionError: expected undefined to be 1 // Object.is equality`

**Step 3 — Write minimal implementation**
Run impact first because this changes the `ExaSearchOptions` public shape:
`impact({ symbols: ["searchExa", "findSimilarExa"], changeType: "signature_change", maxDepth: 4 })`
Expected dependents to account for: `index.ts`, `exa-search.test.ts`.

In `exa-search.ts`, remove `maxAgeHours?: number` from `ExaSearchOptions` and keep `freshness?: Freshness`:

```ts
export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  type?: "auto" | "instant" | "deep" | "keyword";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
  detail?: "summary" | "highlights";
  freshness?: Freshness;
}
```

Then replace the old request-body maxAgeHours block in `searchExa` with:

```ts
  const maxAgeHours = exaMaxAgeHoursForFreshness(options.freshness);
  if (maxAgeHours !== undefined) {
    requestBody.maxAgeHours = maxAgeHours;
  }
```

Do not add any freshness-derived `maxAgeHours` block to `findSimilarExa`; it must continue omitting unsupported fields.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run exa-search.test.ts -t "derives maxAgeHours from canonical freshness"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

Covers: AC 8, AC 9, AC 10, AC 11, AC 12, AC 16, AC 17, AC 19.
