# Plan

### Task 1: Export canonical Freshness mapping helper

### Task 1: Export canonical Freshness mapping helper

**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`

**Step 1 — Write the failing test**
Add `exaMaxAgeHoursForFreshness` to the import and add this test inside `describe("searchExa", () => { ... })` before the request-body tests:

```ts
import { searchExa, findSimilarExa, formatSearchResults, exaMaxAgeHoursForFreshness, type ExaSearchResult } from "./exa-search.js";

it("maps canonical freshness values to Exa maxAgeHours", () => {
  expect(exaMaxAgeHoursForFreshness("realtime")).toBe(1);
  expect(exaMaxAgeHoursForFreshness("day")).toBe(24);
  expect(exaMaxAgeHoursForFreshness("week")).toBe(168);
  expect(exaMaxAgeHoursForFreshness("any")).toBeUndefined();
  expect(exaMaxAgeHoursForFreshness(undefined)).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run exa-search.test.ts -t "maps canonical freshness values"`
Expected: FAIL — `SyntaxError: The requested module './exa-search.js' does not provide an export named 'exaMaxAgeHoursForFreshness'`

**Step 3 — Write minimal implementation**
Add this code near the top of `exa-search.ts`, after `ExaSearchResult`, and add `freshness?: Freshness` to `ExaSearchOptions` while leaving `maxAgeHours?: number` in place for the later migration task:

```ts
export type Freshness = "realtime" | "day" | "week" | "any";

export function exaMaxAgeHoursForFreshness(freshness: Freshness | undefined): number | undefined {
  switch (freshness) {
    case "realtime":
      return 1;
    case "day":
      return 24;
    case "week":
      return 168;
    case "any":
    case undefined:
      return undefined;
  }
}

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
  maxAgeHours?: number;
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run exa-search.test.ts -t "maps canonical freshness values"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

Covers: AC 3, AC 4, AC 7, AC 9.

### Task 2: Normalize and pass through canonical freshness [depends: 1]

### Task 2: Normalize and pass through canonical freshness [depends: 1]

**Files:**
- Modify: `tool-params.ts`
- Modify: `index.ts`
- Test: `tool-params.test.ts`

**Step 1 — Write the failing test**
Replace the freshness-related tests in `tool-params.test.ts` with this single canonical normalization test:

```ts
it("normalizeWebSearchInput preserves canonical freshness without maxAgeHours", () => {
  expect(normalizeWebSearchInput({ query: "x", freshness: "realtime" }).freshness).toBe("realtime");
  expect(normalizeWebSearchInput({ query: "x", freshness: "day" }).freshness).toBe("day");
  expect(normalizeWebSearchInput({ query: "x", freshness: "week" }).freshness).toBe("week");
  expect(normalizeWebSearchInput({ query: "x", freshness: "any" }).freshness).toBe("any");
  expect(normalizeWebSearchInput({ query: "x", freshness: "invalid" }).freshness).toBeUndefined();
  expect(normalizeWebSearchInput({ query: "x" }).freshness).toBeUndefined();
  expect(normalizeWebSearchInput({ query: "x", freshness: "day" })).not.toHaveProperty("maxAgeHours");
});
```

Keep the existing validation tests for `similarUrl` mutually exclusive with `query`/`queries` and missing query input.

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tool-params.test.ts -t "preserves canonical freshness"`
Expected: FAIL — `AssertionError: expected undefined to be 'realtime' // Object.is equality`

**Step 3 — Write minimal implementation**
In `tool-params.ts`, import the type and replace the freshness mapping with canonical freshness pass-through:

```ts
import type { Freshness } from "./exa-search.js";

const VALID_SEARCH_TYPES = new Set(["auto", "instant", "deep"]);
const VALID_CATEGORIES = new Set([
  "company", "research paper", "news", "tweet",
  "people", "personal site", "financial report", "pdf",
]);
const VALID_DETAIL_VALUES = new Set(["summary", "highlights"]);
const VALID_FRESHNESS_VALUES = new Set(["realtime", "day", "week", "any"]);

export type NormalizedWebSearchInput = {
  queries: string[];
  numResults: number;
  type?: "auto" | "instant" | "deep";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  detail?: "summary" | "highlights";
  freshness?: Freshness;
  similarUrl?: string;
};
```

Then replace the old `maxAgeHours` block and return statement in `normalizeWebSearchInput` with:

```ts
  const freshness = typeof params.freshness === "string" && VALID_FRESHNESS_VALUES.has(params.freshness)
    ? params.freshness as Freshness
    : undefined;

  return { queries: queryList, numResults, type, category, includeDomains, excludeDomains, detail, freshness, similarUrl };
```

In `index.ts`, keep existing behavior green by destructuring `freshness`, detecting unsupported similarUrl freshness from `freshness`, and passing `freshness` to `searchExa`:

```ts
      const { queries: queryList, numResults, type, category, includeDomains, excludeDomains, detail, freshness, similarUrl } = params as any;
```

```ts
          if (freshness !== undefined) unsupportedFilters.push("freshness");
```

```ts
                  freshness,
```

The `freshness,` line replaces the old `maxAgeHours,` line in the `searchExa` options object.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tool-params.test.ts -t "preserves canonical freshness"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

Covers: AC 5, AC 6, AC 13, AC 14, AC 15.

### Task 3: Derive maxAgeHours at the Exa search boundary [depends: 1, 2]

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

### Task 4: Clarify realtime freshness documentation [no-test] [depends: 1, 2, 3]

### Task 4: Clarify realtime freshness documentation [no-test]

**Justification:** Documentation-only change for README wording. Runtime behavior is covered by Tasks 1–3.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**
Update the `web_search` parameter table entry for `freshness` so it explicitly documents the supported public values and clarifies that `"realtime"` means the last 1 hour:

```md
| `freshness` | `string` | `"realtime"` (last 1 hour), `"day"` (24h), `"week"` (168h), or `"any"` (no freshness filter) |
```

Do not document or add a public `maxAgeHours` parameter.

**Step 2 — Verify**
Run: `npm test`
Expected: all passing

Covers: AC 1, AC 2, AC 18.
