# Diagnosis: Exa search parameter handling — two bugs

---

## Bug #018 — `freshness: "realtime"` is broken

### Root Cause

`FRESHNESS_MAP` maps `"realtime"` → `maxAgeHours: 0`. The code sends `maxAgeHours: 0` as a **top-level field** in the Exa API request body. This does not filter results by publication recency.

Two compounding problems:

1. **Semantic mismatch — `maxAgeHours` is not a result-date filter.** According to the Exa OpenAPI spec (`exa-openapi-spec.yaml`), `maxAgeHours` lives inside `ContentsRequest` (nested under `contents`) and controls **livecrawl cache behavior** — not result date filtering:

   ```
   maxAgeHours: integer
     - Positive value (e.g. 24): Use cached content if less than N hours old, otherwise livecrawl.
     - 0: Always livecrawl, never use cache.
     - -1: Never livecrawl, always use cache.
     - Omit (default): Livecrawl as fallback only when no cached content exists.
   ```

   The code is sending it as a top-level key (`requestBody.maxAgeHours = 0`), not nested inside `contents`. The Exa API's actual publication-date filters are `startPublishedDate` / `endPublishedDate` (ISO 8601 strings) in `CommonRequest`.

2. **`0` is the maximally broken value.** Even granting that Exa might have historically accepted top-level `maxAgeHours` as a recency hint, value `0` means "last 0 hours" — i.e. no content would match. Exa ignores it and returns unfiltered results. Values like `24` and `168` (for `day`/`week`) may have worked historically as Exa extensions, but `0` is definitively broken.

### Trace

```
user calls web_search({ freshness: "realtime" })
  → index.ts:185: normalizeWebSearchInput(params) → { maxAgeHours: 0 }
  → index.ts:257-267: searchExa(query, { ..., maxAgeHours: 0 })
  → exa-search.ts:109-111:
      if (options.maxAgeHours !== undefined)   // true: 0 !== undefined ✓
        requestBody.maxAgeHours = 0            // sent as top-level field
  → Exa API: interprets maxAgeHours as ContentsRequest/livecrawl control
             0 = "always livecrawl, never use cache" — NOT a date filter
  → Results: unfiltered by date, stale content (e.g., 2022 blog posts) returned
```

### Affected Code

| File | Location | Issue |
|------|----------|-------|
| `tool-params.ts` | Line 11: `FRESHNESS_MAP` | `realtime → 0` is an invalid Exa API value for date filtering |
| `exa-search.ts` | Lines 109–111 | `maxAgeHours` sent as top-level field; Exa spec puts it in `ContentsRequest` |
| `index.ts` | Line 98 (schema description) | Documents `"realtime" (0h)` — this description is misleading/incorrect |

---

## Bug #019 — `findSimilarExa` silently drops all filters

### Root Cause

**Two-layer failure.** Filters are dropped at both the call site (`index.ts`) and the implementation (`exa-search.ts`):

**Layer 1 — `index.ts:200-208`:** When `similarUrl` is set, `findSimilarExa` is called with only `{ apiKey, numResults, signal, detail }`. The values `category`, `includeDomains`, `excludeDomains`, and `maxAgeHours` are destructured from `normalizeWebSearchInput` at line 185 but never passed to `findSimilarExa`.

**Layer 2 — `exa-search.ts:157-165`:** Even if the options were passed, `findSimilarExa` does not read or use `includeDomains`, `excludeDomains`, `category`, or `maxAgeHours` — the request body only ever includes `{ url, numResults, contents }`.

### Trace

```
user calls web_search({ similarUrl: "...", freshness: "day", includeDomains: ["github.com"] })
  → index.ts:185: normalizeWebSearchInput(params) → 
      { maxAgeHours: 24, includeDomains: ["github.com"], ..., similarUrl: "..." }
  → index.ts:200: if (similarUrl) {
  → index.ts:203-208: findSimilarExa(similarUrl, {
        apiKey: ...,
        numResults: ...,
        signal: ...,
        detail,
        // ❌ maxAgeHours: NOT PASSED
        // ❌ category: NOT PASSED
        // ❌ includeDomains: NOT PASSED
        // ❌ excludeDomains: NOT PASSED
    })
  → exa-search.ts:157-163: requestBody = { url, numResults, contents }
        // ❌ includeDomains: never added even if in options
        // ❌ excludeDomains: never added even if in options
  → Exa /findSimilar: receives no filters → returns unfiltered results
```

### Affected Code

| File | Location | Issue |
|------|----------|-------|
| `index.ts` | Lines 203–208 | `findSimilarExa` call omits `includeDomains`, `excludeDomains`, `category`, `maxAgeHours` |
| `exa-search.ts` | Lines 157–165 | `findSimilarExa` request body never includes domain or freshness filters |

### What Exa's `/findSimilar` API Actually Supports

Confirmed from the [Exa OpenAPI spec](https://raw.githubusercontent.com/exa-labs/openapi-spec/refs/heads/master/exa-openapi-spec.yaml) — `/findSimilar` uses `CommonRequest` which includes:

| Parameter | Supported | Notes |
|-----------|-----------|-------|
| `includeDomains` | ✅ Yes | In `CommonRequest` |
| `excludeDomains` | ✅ Yes | In `CommonRequest` |
| `category` | ❌ No | Search-specific, not in `CommonRequest` |
| `maxAgeHours` | ❌ No (as top-level) | In `ContentsRequest` only (livecrawl control) |
| `type` | ❌ No | Search-specific |

This means:
- `includeDomains` and `excludeDomains` can and should be forwarded to `/findSimilar`
- `category` and `maxAgeHours` (as freshness intent) should produce a user-visible warning since they cannot be applied

---

## Pattern Analysis

**Working code (`searchExa`):**
```ts
// After building base body, append optional fields:
if (options.category) requestBody.category = options.category;
if (options.includeDomains?.length > 0) requestBody.includeDomains = options.includeDomains;
if (options.excludeDomains?.length > 0) requestBody.excludeDomains = options.excludeDomains;
if (options.maxAgeHours !== undefined) requestBody.maxAgeHours = options.maxAgeHours;
```

**Broken code (`findSimilarExa`):**
```ts
// Builds base body only — nothing appended after:
const requestBody = { url, numResults, contents };
const body = JSON.stringify(requestBody);  // ← serialized immediately, filters never added
```

The difference: `searchExa` has a filter-appending block between building `requestBody` and calling `JSON.stringify`. `findSimilarExa` goes straight to `JSON.stringify` with no filter block. This was a copy-paste omission.

---

## Risk Assessment

### What could break if changed

**Bug #018 fix:**
- The existing test at `tool-params.test.ts:93-96` explicitly asserts `freshness: "realtime"` → `maxAgeHours: 0`. **This test must be updated** (it's testing the wrong behavior).
- Changing `FRESHNESS_MAP.realtime` from `0` will change the value sent to Exa. The user-visible behavior can only improve (currently nothing is filtered at all).
- If the fix removes `"realtime"` from the enum entirely, `index.ts` TypeBox schema (line 94) must also be updated, as must README docs.

**Bug #019 fix:**
- Adding `includeDomains` and `excludeDomains` to `findSimilarExa` requests: safe. Exa accepts these, and users who pass them currently get wrong (unfiltered) results — this can only improve.
- The `ExaSearchOptions` interface already declares `includeDomains` and `excludeDomains`, so no type changes needed in `exa-search.ts`.
- The call site in `index.ts` needs to pass the new options — low-risk change.

### Dependencies on affected code

- `index.ts` → `findSimilarExa` (call site)
- `exa-search.ts` → `ExaSearchOptions` (interface already has the fields)
- `tool-params.ts` → `FRESHNESS_MAP` (used only in `normalizeWebSearchInput`)
- `index.ts` → TypeBox schema description for `freshness.realtime` (doc string)
- `README.md` → documents freshness values

---

## Fixed When

### Bug #018
1. `freshness: "realtime"` maps to a non-zero value (e.g., `1`) OR `"realtime"` is removed from the enum and schema
2. The old test asserting `realtime → 0` is removed or updated to reflect the fix
3. The new failing test (`BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0`) passes
4. README documents the corrected behavior

### Bug #019
1. `findSimilarExa` includes `includeDomains` and `excludeDomains` in its request body when provided
2. `findSimilarExa` emits a user-visible note when `freshness`/`category` are provided but cannot be applied (not supported by `/findSimilar`)
3. The call site in `index.ts` passes `includeDomains` and `excludeDomains` to `findSimilarExa`
4. All four new failing tests (`BUG #019: sends maxAgeHours`, `includeDomains`, `excludeDomains`, `category`) pass — domain tests pass, maxAgeHours/category tests adjusted to check for warning note instead
5. README documents which params are supported with `similarUrl`
