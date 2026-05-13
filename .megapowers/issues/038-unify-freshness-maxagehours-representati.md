---
id: 38
type: feature
status: in-progress
created: 2026-05-13T15:50:54.040Z
priority: 4
---
# Unify freshness/maxAgeHours representation into a single source of truth
## Problem

Web search freshness is represented two ways in the codebase:

- **External API:** `freshness: "realtime" | "day" | "week" | "any"` (visible to the LLM, in `WebSearchParams`).
- **Internal API:** `maxAgeHours: number | undefined` (used by `searchExa`, `findSimilarExa`, and `smart-search` after normalization).

The mapping happens in `normalizeWebSearchInput` (`tool-params.ts`) and the conversion back to Exa's actual request shape happens in `exa-search.ts`. Three slightly-different time windows are tracked across these files, which makes:

- `exa-search.ts` parameter handling subtly fragile (see the history behind issues #018, #019, #020).
- "Why didn't `freshness: realtime` return realtime results?" debugging painful.
- The `similarUrl` path explicitly drops `maxAgeHours` with a warning note, while the regular path silently rejects unsupported combinations.

## Acceptance criteria

- Pick one representation as the canonical internal type (likely the `Freshness` string enum). Keep `maxAgeHours` as a derived value computed once at the Exa-call boundary.
- Centralize the freshness → Exa request mapping in a single function (e.g., `exaSearchOptions(freshness)` in `exa-search.ts`).
- Remove the dual representation from `smart-search.ts` and `tool-params.ts`.
- The 36-test `exa-search.test.ts` suite stays green; add one test that asserts the four canonical freshness values produce the documented Exa request shapes.
- No external/tool-facing schema change.

## Files likely touched

- `tool-params.ts`
- `exa-search.ts`
- `smart-search.ts`
- `index.ts` (call site adjustments)
- Their respective tests

## Notes

Pure refactor; no feature change. Mainly an investment in keeping search options easy to reason about as Exa adds more knobs.

