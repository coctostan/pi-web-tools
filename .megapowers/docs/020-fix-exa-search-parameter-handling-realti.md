# Bugfix Summary — Issue #020: Fix Exa Search Parameter Handling

**Issues resolved:** #018 (freshness `"realtime"` broken) · #019 (`similarUrl` silently drops filters)

---

## Bug #018 — `freshness: "realtime"` Mapped to `maxAgeHours: 0`

### Root Cause

`FRESHNESS_MAP` in `tool-params.ts` mapped `"realtime"` → `0`. Because the `maxAgeHours !== undefined` guard passes for `0`, the value was sent to Exa. The Exa API treats `maxAgeHours: 0` as "always livecrawl, never use cache" — not a date recency filter — so results were completely unfiltered by date. Users requesting realtime results got articles from 2022.

### Fix

Changed `FRESHNESS_MAP` entry from `realtime: 0` to `realtime: 1` (last 1 hour). Updated the existing test that asserted `→ 0` to assert `→ 1`. The pre-existing regression test `BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0` now passes.

### Files Changed

| File | Change |
|------|--------|
| `tool-params.ts` | `FRESHNESS_MAP.realtime: 0` → `1` |
| `tool-params.test.ts` | Updated assertion `toBe(0)` → `toBe(1)`; regression test now passes |
| `README.md` | `freshness` table row: `"realtime"` now described as "last 1 hour" |

---

## Bug #019 — `findSimilarExa` Silently Dropped All Filters

### Root Cause

Two-layer failure:

1. **`exa-search.ts`:** `findSimilarExa` built `requestBody` and immediately called `JSON.stringify` with no filter-appending block — unlike `searchExa` which appends `includeDomains`, `excludeDomains`, `category`, and `maxAgeHours` after building the base body.

2. **`index.ts`:** The `similarUrl` branch called `findSimilarExa` with only `{ apiKey, numResults, signal, detail }`, never forwarding `includeDomains` or `excludeDomains` that were destructured from `normalizeWebSearchInput`. Also: no user-visible warning when `freshness` or `category` (unsupported by `/findSimilar`) were provided.

### Fix

Per the Exa OpenAPI spec, `/findSimilar` uses `CommonRequest` which supports `includeDomains` and `excludeDomains` but NOT `category` or top-level `maxAgeHours`.

- **`exa-search.ts`:** Added domain filter block in `findSimilarExa` (mirrors the existing pattern in `searchExa`).
- **`index.ts`:** Updated `similarUrl` branch to: (a) detect unsupported filters (`freshness`/`category`) and build a `warningNote`, (b) pass `includeDomains` and `excludeDomains` to `findSimilarExa`, (c) prepend `warningNote` to the answer.

### Files Changed

| File | Change |
|------|--------|
| `exa-search.ts` | Added `includeDomains`/`excludeDomains` filter block in `findSimilarExa` |
| `exa-search.test.ts` | Added 2 passing domain tests; corrected 2 unsupported-param tests to assert absence |
| `index.ts` | `similarUrl` branch forwards domain filters + emits warning for freshness/category |
| `index.test.ts` | Added 3 new tests: domain passthrough + freshness/category warning notes |
| `README.md` | `similarUrl` row documents supported/unsupported filters and warning behavior |

---

## Verification

- **206/206 tests pass** across 15 test files
- `freshness: "realtime"` → `maxAgeHours: 1` confirmed via `tool-params.test.ts`
- `findSimilarExa` domain forwarding confirmed via `exa-search.test.ts`
- `index.ts` domain passthrough and warning notes confirmed via `index.test.ts`
