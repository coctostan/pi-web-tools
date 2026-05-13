---
id: 16
title: Tighten WebSearchParams.numResults and prepare-function return types
status: approved
depends_on:
  - 12
  - 13
  - 14
  - 15
no_test: false
files_to_modify:
  - index.ts
  - tool-params.ts
  - tool-params.test.ts
files_to_create: []
---

Express `numResults` as `Type.Integer({ minimum: 1, maximum: 20 })` in the visible TypeBox schema, have `normalizeWebSearchInput` clamp/default it so the prepare hook produces a schema-valid integer, and add explicit return types plus focused normalization tests for all four prepare functions. (AC-PREPARE-3, AC-PREPARE-4, AC-PREPARE-6.)

**Files:**
- Modify: `index.ts`
- Modify: `tool-params.ts`
- Modify: `tool-params.test.ts`

**Step 1 — Write the failing tests**

In `tool-params.test.ts`, update the import to include `normalizeGetSearchContentInput`:

```ts
import { normalizeWebSearchInput, normalizeFetchContentInput, normalizeCodeSearchInput, normalizeGetSearchContentInput, dedupeUrls } from "./tool-params.js";
```

Append these focused prepare-function tests:

```ts
it("normalizeWebSearchInput defaults and clamps numResults for prepareArguments (AC-PREPARE-4)", () => {
  expect(normalizeWebSearchInput({ query: "q" }).numResults).toBe(5);
  expect(normalizeWebSearchInput({ query: "q", numResults: 0 }).numResults).toBe(1);
  expect(normalizeWebSearchInput({ query: "q", numResults: -5 }).numResults).toBe(1);
  expect(normalizeWebSearchInput({ query: "q", numResults: 100 }).numResults).toBe(20);
  expect(normalizeWebSearchInput({ query: "q", numResults: 7.6 }).numResults).toBe(8);
});

it("normalize prepare functions produce the post-prepare shapes consumed by execute (AC-PREPARE-3)", () => {
  expect(normalizeWebSearchInput({ query: "q" }).queries).toEqual(["q"]);
  expect(normalizeFetchContentInput({ url: "https://a" }).urls).toEqual(["https://a"]);
  expect(normalizeFetchContentInput({ urls: ["u1", "u1", "u2"] }).urls).toEqual(["u1", "u2"]);
  expect(normalizeCodeSearchInput({ query: "useState" })).toEqual({ query: "useState", tokensNum: undefined });
  expect(normalizeGetSearchContentInput({ responseId: "r1" })).toEqual({ responseId: "r1", query: undefined, queryIndex: undefined, url: undefined, urlIndex: undefined, maxChars: undefined });
});

it("normalizeWebSearchInput maps freshness and preserves documented validation errors (AC-PREPARE-6)", () => {
  expect(normalizeWebSearchInput({ query: "q", freshness: "day" }).maxAgeHours).toBe(24);
  expect(() => normalizeWebSearchInput({ query: "q", similarUrl: "https://x" })).toThrow("'similarUrl' and 'query'/'queries' are mutually exclusive.");
  expect(() => normalizeWebSearchInput({})).toThrow("Either 'query' or 'queries' must be provided.");
  expect(() => normalizeFetchContentInput({})).toThrow("Either 'url' or 'urls' must be provided.");
  expect(() => normalizeCodeSearchInput({})).toThrow("'query' must be provided.");
  expect(() => normalizeGetSearchContentInput({})).toThrow("'responseId' must be provided.");
});
```

**Step 2 — Run tests, verify they fail**
Run: `npx vitest run tool-params.test.ts -t "prepareArguments|AC-PREPARE"`
Expected: FAIL — `expect(normalizeWebSearchInput({ query: "q" }).numResults).toBe(5)` receives `undefined` because `normalizeWebSearchInput` currently leaves `numResults` undefined and the clamp/default lives inside `web_search.execute`.

**Step 3 — Write minimal implementation**

In `tool-params.ts`, add explicit return types near the top:

```ts
export type NormalizedWebSearchInput = {
  queries: string[];
  numResults: number;
  type?: "auto" | "instant" | "deep";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  detail?: "summary" | "highlights";
  maxAgeHours?: number;
  similarUrl?: string;
};

export type NormalizedFetchContentInput = {
  urls: string[];
  forceClone?: boolean;
  prompt?: string;
  noCache?: boolean;
};

export type NormalizedCodeSearchInput = {
  query: string;
  tokensNum?: number;
};

export type NormalizedGetSearchContentInput = {
  responseId: string;
  query?: string;
  queryIndex?: number;
  url?: string;
  urlIndex?: number;
  maxChars?: number;
};
```

Update the function signatures to return those types:

```ts
export function normalizeWebSearchInput(params: { /* existing param shape */ }): NormalizedWebSearchInput {
```

```ts
export function normalizeFetchContentInput(params: { url?: unknown; urls?: unknown; forceClone?: unknown; prompt?: unknown; noCache?: unknown }): NormalizedFetchContentInput {
```

```ts
export function normalizeCodeSearchInput(params: { query?: unknown; tokensNum?: unknown }): NormalizedCodeSearchInput {
```

```ts
export function normalizeGetSearchContentInput(params: { responseId?: unknown; query?: unknown; queryIndex?: unknown; url?: unknown; urlIndex?: unknown; maxChars?: unknown }): NormalizedGetSearchContentInput {
```

In `normalizeWebSearchInput`, replace the current `numResults` block:

```ts
const numResults = typeof params.numResults === "number" && Number.isFinite(params.numResults)
  ? params.numResults
  : undefined;
```

with:

```ts
let numResults: number;
if (typeof params.numResults === "number" && Number.isFinite(params.numResults)) {
  numResults = Math.max(1, Math.min(20, Math.round(params.numResults)));
} else {
  numResults = 5;
}
```

In `index.ts`, update `WebSearchParams.numResults` from optional number to a bounded integer supplied by prepareArguments:

```ts
numResults: Type.Integer({ minimum: 1, maximum: 20, description: "Results per query (default: 5, max: 20)" }),
```

Also inside the two `numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5` lines in `web_search.execute`, simplify to:

```ts
numResults,
```

**Step 4 — Run tests, verify they pass**
Run: `npx vitest run tool-params.test.ts -t "prepareArguments|AC-PREPARE"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing. Note: existing tests that pass `numResults: undefined` or omit it will now see `numResults === 5`. Update any `index.test.ts` assertions that expect `numResults: undefined` to expect `numResults: 5`.
