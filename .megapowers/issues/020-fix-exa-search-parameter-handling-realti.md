---
id: 20
type: bugfix
status: in-progress
created: 2026-03-06T14:41:23.795Z
sources: [18, 19]
---
# Fix Exa search parameter handling — realtime freshness + similarUrl filter passthrough
Two related bugs in how search parameters are passed to the Exa API.

**#018** — `freshness: "realtime"` maps to `maxAgeHours: 0` which Exa ignores (treats as no filter). Fix: remove "realtime" from the enum or remap to a meaningful non-zero value.

**#019** — `findSimilarExa` drops `maxAgeHours`, `category`, `includeDomains`, and `excludeDomains` silently. Fix: pass supported params through to Exa's findSimilar endpoint; emit a warning note for any that aren't supported.

Both bugs are in `tool-params.ts` / `exa-search.ts` and require new test coverage.
