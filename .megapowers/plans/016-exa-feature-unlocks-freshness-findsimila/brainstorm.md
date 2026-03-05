# Brainstorm: Exa Feature Unlocks — Freshness + findSimilar

## Approach

Two small additive features to `web_search`, both thin pass-throughs to Exa API capabilities that are already paid for.

**Freshness control** adds a `freshness` enum param (`"realtime"` | `"day"` | `"week"` | `"any"`) that maps to Exa's `maxAgeHours` field (0, 24, 168, omitted respectively). It touches `exa-search.ts` (option + request body), `tool-params.ts` (validation), and `index.ts` (schema). Zero new abstractions.

**findSimilar** adds a `similarUrl` string param to `web_search` as an alternative to `query`/`queries`. When present, the tool routes to Exa's `POST /findSimilar` endpoint via a new `findSimilarExa()` function in `exa-search.ts`. It reuses the existing `parseExaResults()` and `formatSearchResults()` functions — same output format. The validation in `tool-params.ts` is updated to require either `query`/`queries` **or** `similarUrl`, and errors if both are provided. The execute path in `index.ts` branches early: `similarUrl` → single `findSimilarExa` call, otherwise → existing `pLimit` loop.

## Key Decisions

- **Error if both `similarUrl` and `query`/`queries` provided** — explicit contract, easy to test, no silent precedence surprises
- **`findSimilarExa` as a new function in `exa-search.ts`** (not a new file) — reuses `parseExaResults`, `retryFetch`, `ExaSearchResult` already there; no new file justified for ~30 lines
- **No batching for `findSimilar`** — the endpoint takes a single URL; the `pLimit` loop is skipped entirely for that path
- **`freshness: "any"` omits `maxAgeHours` from the request** — Exa's default behavior, no value sent
- **Enum for freshness, not raw number** — cleaner DX, self-documenting, covers all useful cases per roadmap

## Components

- **`exa-search.ts`**: Add `maxAgeHours?: number` to `ExaSearchOptions`; map `freshness` enum → number in `searchExa`; add `findSimilarExa(url, options)` function hitting `https://api.exa.ai/findSimilar`
- **`tool-params.ts`**: Add `freshness` validation (4-value enum) and `similarUrl` string to `normalizeWebSearchInput`; update the "must have query" guard to accept `similarUrl` as an alternative; error if both provided
- **`index.ts`**: Add `freshness` and `similarUrl` to `WebSearchParams` TypeBox schema; pass `freshness` into `searchExa` options; add branch in execute for `similarUrl` path

## Testing Strategy

All tests in existing `exa-search.test.ts` and `tool-params.test.ts`, following the established mock-fetch pattern:

- **`freshness`**: `normalizeWebSearchInput` unit tests for each enum value + "any" omission; `searchExa` tests asserting correct `maxAgeHours` in request body (or absent for "any"); invalid value falls back to omitting the field
- **`findSimilar`**: `findSimilarExa` unit tests hitting the correct endpoint URL; `normalizeWebSearchInput` tests for `similarUrl` accepted alone, error when combined with `query`, error when neither provided; `index.ts` integration test asserting the correct function is called based on which param is present
- All existing tests must stay green (additive changes only)
