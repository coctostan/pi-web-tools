# Reproduction: Exa search parameter handling — two bugs confirmed

## Steps to Reproduce

### Bug #018 — `freshness: "realtime"` maps to `maxAgeHours: 0`, which Exa ignores

1. Call `normalizeWebSearchInput({ query: "x", freshness: "realtime" })` — returns `{ maxAgeHours: 0 }`
2. `searchExa` receives `maxAgeHours: 0`; the guard `if (options.maxAgeHours !== undefined)` passes because `0 !== undefined`
3. The Exa API request body includes `"maxAgeHours": 0`
4. Exa interprets `0` as "no filter" — identical to omitting the field entirely
5. Stale results (years old) are returned despite requesting `"realtime"` freshness

### Bug #019 — `similarUrl` silently drops `freshness`, `category`, `includeDomains`, `excludeDomains`

1. Call `web_search({ similarUrl: "https://bun.sh/", freshness: "day", category: "news", includeDomains: ["github.com"] })`
2. These options reach `findSimilarExa` via `exa-search.ts`
3. `findSimilarExa` builds its request body with only `{ url, numResults, contents }` — no other fields are ever appended
4. The filters are silently dropped; Exa never receives them
5. Results are unfiltered by freshness, category, or domain

---

## Expected Behavior

### Bug #018
`freshness: "realtime"` should filter to genuinely recent results. Either:
- Map to a small positive value (e.g., `1` hour), OR
- Be removed from the supported enum

### Bug #019
`findSimilarExa` should forward supported filters (`maxAgeHours`, `category`, `includeDomains`, `excludeDomains`) to the Exa `/findSimilar` endpoint in the request body, just as `searchExa` does.

---

## Actual Behavior

### Bug #018
```
normalizeWebSearchInput({ query: "x", freshness: "realtime" }).maxAgeHours
// → 0  (Exa ignores this, returns results of any age)
```

### Bug #019
```
// findSimilarExa request body for findSimilarExa("https://example.com", { apiKey: "key", maxAgeHours: 24, category: "news" })
{
  "url": "https://example.com",
  "numResults": 5,
  "contents": { "summary": true }
  // maxAgeHours, category, includeDomains, excludeDomains — ALL MISSING
}
```

---

## Evidence

### Failing test output (`npm test`):

```
FAIL  tool-params.test.ts > BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0
AssertionError: expected +0 not to be +0 // Object.is equality
  ❯ tool-params.test.ts:102:36
      expect(result.maxAgeHours).not.toBe(0);

FAIL  exa-search.test.ts > findSimilarExa — BUG #019: sends maxAgeHours in request body when provided
AssertionError: expected undefined to be 24 // Object.is equality
  ❯ exa-search.test.ts:534:32
      expect(body.maxAgeHours).toBe(24);

FAIL  exa-search.test.ts > findSimilarExa — BUG #019: sends includeDomains in request body when provided
AssertionError: expected undefined to deeply equal [ 'github.com' ]
  ❯ exa-search.test.ts:547:35
      expect(body.includeDomains).toEqual(["github.com"]);

FAIL  exa-search.test.ts > findSimilarExa — BUG #019: sends excludeDomains in request body when provided
AssertionError: expected undefined to deeply equal [ 'pinterest.com' ]
  ❯ exa-search.test.ts:560:35
      expect(body.excludeDomains).toEqual(["pinterest.com"]);

FAIL  exa-search.test.ts > findSimilarExa — BUG #019: sends category in request body when provided
AssertionError: expected undefined to be 'news' // Object.is equality
  ❯ exa-search.test.ts:573:29
      expect(body.category).toBe("news");

Test Files  2 failed | 13 passed (15)
     Tests  5 failed | 198 passed (203)
```

### Source code evidence

**Bug #018 — `tool-params.ts` line 11:**
```ts
const FRESHNESS_MAP: Record<string, number | undefined> = { realtime: 0, day: 24, week: 168, any: undefined };
//                                                                    ^
//                                  Exa ignores maxAgeHours: 0 (treats as "no limit")
```

**`exa-search.ts` lines 109–111** — guard passes because `0 !== undefined`:
```ts
if (options.maxAgeHours !== undefined) {
  requestBody.maxAgeHours = options.maxAgeHours;  // 0 IS sent, Exa ignores it
}
```

**Bug #019 — `exa-search.ts` `findSimilarExa` request body (lines 157–163):**
```ts
const requestBody: Record<string, unknown> = {
  url,
  numResults,
  contents: options.detail === "highlights"
    ? { highlights: { numSentences: 3, highlightsPerUrl: 3 } }
    : { summary: true },
};
// ← NO maxAgeHours, category, includeDomains, excludeDomains added anywhere below
const body = JSON.stringify(requestBody);  // line 165 — filters gone
```

Compare `searchExa` (lines 96–111) which correctly appends all four filters after building the base body.

---

## Environment

- Node.js: checked via `node --version` (project uses `tsx`/vitest)
- Test runner: vitest v3.2.4
- Package: `@coctostan/pi-exa-gh-web-tools@2.0.0`
- OS: macOS

---

## Failing Tests

### Bug #018 — `tool-params.test.ts` (added after line 96):
```ts
it("BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0 (Exa ignores 0 as no-filter)", () => {
  const result = normalizeWebSearchInput({ query: "x", freshness: "realtime" });
  // maxAgeHours: 0 is treated by Exa identically to omitting the field (no filtering).
  // 'realtime' should either be removed from the enum or map to a small positive value.
  expect(result.maxAgeHours).not.toBe(0);
});
```

### Bug #019 — `exa-search.test.ts` (new `describe` block added after `findSimilarExa` describe):
```ts
describe("findSimilarExa — BUG #019: filters silently dropped", () => {
  it("BUG #019: sends maxAgeHours in request body when provided", ...)
  it("BUG #019: sends includeDomains in request body when provided", ...)
  it("BUG #019: sends excludeDomains in request body when provided", ...)
  it("BUG #019: sends category in request body when provided", ...)
});
```

All 4 fail because `body.maxAgeHours`, `body.includeDomains`, `body.excludeDomains`, and `body.category` are all `undefined` in `findSimilarExa`'s request body.

---

## Reproducibility

**Always** — both bugs are deterministic, structural issues in the request-building logic. No race conditions or timing dependencies.
