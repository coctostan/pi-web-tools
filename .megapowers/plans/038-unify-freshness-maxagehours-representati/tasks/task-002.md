---
id: 2
title: Normalize and pass through canonical freshness
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - tool-params.ts
  - tool-params.test.ts
  - index.ts
files_to_create: []
---

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
