# 038 — Unify Freshness / maxAgeHours Representation

## Summary

This change makes `freshness` the canonical representation for web search recency throughout the tool pipeline. Exa-specific `maxAgeHours` is now derived only at the Exa `/search` request boundary, keeping public and internal web-search handling aligned around the documented values: `"realtime"`, `"day"`, `"week"`, and `"any"`.

It also clarifies public documentation and tool-schema text so `freshness: "realtime"` means the last 1 hour, not `0h`.

## Why

Previously freshness handling mixed two representations:

- public/tool-level `freshness` strings
- Exa-specific `maxAgeHours` values

That made realtime behavior harder to reason about, especially because `0h` is not a useful realtime filter for Exa and can behave like no freshness filter. The goal was to preserve public behavior while moving Exa-specific translation to the one place that builds Exa requests.

## API Surface

Public `web_search` continues to expose only `freshness` with these values:

- `"realtime"` — last 1 hour
- `"day"` — 24 hours
- `"week"` — 168 hours
- `"any"` — no freshness filter

No public `maxAgeHours` tool parameter was added.

Real signatures confirmed from the code:

```ts
export type Freshness = "realtime" | "day" | "week" | "any";

export function exaMaxAgeHoursForFreshness(freshness: Freshness | undefined): number | undefined

export async function searchExa(query: string, options: ExaSearchOptions): Promise<ExaSearchResult[]>

export function normalizeWebSearchInput(params: {
  query?: unknown;
  queries?: unknown;
  numResults?: unknown;
  type?: unknown;
  category?: unknown;
  includeDomains?: unknown;
  excludeDomains?: unknown;
  detail?: unknown;
  freshness?: unknown;
  similarUrl?: unknown;
}): NormalizedWebSearchInput
```

## Implementation Notes

- `exa-search.ts` exports `Freshness` and `exaMaxAgeHoursForFreshness()`.
- `normalizeWebSearchInput()` now returns canonical `freshness` and no longer returns `maxAgeHours`.
- `index.ts` passes canonical `freshness` into `searchExa()`.
- `searchExa()` derives Exa `maxAgeHours` at the `/search` request boundary:
  - `"realtime"` → `1`
  - `"day"` → `24`
  - `"week"` → `168`
  - `"any"` / omitted → no `maxAgeHours` field
- `findSimilarExa()` continues to omit unsupported fields such as `maxAgeHours` and `category`.
- `similarUrl` searches still warn when meaningful unsupported filters are ignored, but do not warn for `freshness: "any"` because it is equivalent to no freshness filter.
- README and tool schema documentation now describe realtime freshness as the last 1 hour.

## Files Changed

- `exa-search.ts`
- `exa-search.test.ts`
- `tool-params.ts`
- `tool-params.test.ts`
- `index.ts`
- `index.test.ts`
- `README.md`
- `.megapowers/plans/038-unify-freshness-maxagehours-representati/verify.md`
- `.megapowers/plans/038-unify-freshness-maxagehours-representati/code-review.md`

## Verification

Final validation after review fixes:

```text
npm test
# 25 test files passed
# 313 tests passed

npm run build
# Build successful
```

Focused review-fix tests also passed:

```text
npx vitest run index.test.ts -t "schema documents realtime|freshness any"
# 2 tests passed
```

## PR Title

Unify web search freshness handling at the Exa boundary

## PR Description

### Summary
- Make canonical `freshness` the internal web-search recency representation.
- Derive Exa `maxAgeHours` only inside `searchExa()` when building `/search` requests.
- Clarify README and tool-schema docs so `"realtime"` means the last 1 hour.
- Preserve `/findSimilar` unsupported-filter behavior, including warnings for meaningful ignored filters.

### Testing
- `npm test`
- `npm run build`
- `npx vitest run index.test.ts -t "schema documents realtime|freshness any"`
