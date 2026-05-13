---
id: 1
title: Export canonical Freshness mapping helper
status: approved
depends_on: []
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

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
