## Approach
This feature should be implemented as a small, rule-based smart-search layer around the existing `web_search` flow. It is not already solved in the codebase: the repo already supports summary-mode search, freshness, `similarUrl`, retry/backoff, parallel query execution, and URL caching, but it does not yet perform query enhancement or post-search dedup/noise filtering for `web_search`. The recommended design is to keep Exa transport logic simple and add two pure processing stages: a pre-search `enhanceQuery()` stage and a post-search `postProcessResults()` stage.

`enhanceQuery()` should apply a narrow set of deterministic rules in priority order: detect error/stack-trace-like queries and force keyword search, preserve explicit version strings already present in the query, and conservatively expand only vague 1-3 word coding queries. `postProcessResults()` should then normalize result URLs, remove only obvious duplicates, and strip only high-confidence snippet noise such as breadcrumb fragments or boilerplate like “last updated”. The system should keep Exa’s original ranking by default, removing later duplicates rather than trying to re-rank results.

The tool output should remain quiet unless something changed. If enhancement or dedup fired, include short conditional notes such as `Searched as: ...`, `Search type overridden to keyword`, or `Removed 2 duplicate results`. This gives transparency without adding routine context noise. The overall design favors predictability, low scope, and strong unit-testability over aggressive heuristics.

## Key Decisions
- Use a dedicated smart-search processing layer instead of burying heuristics in Exa client code.
- Keep the external `web_search` API unchanged; this is an internal quality improvement.
- Apply all three roadmap behaviors in priority order: error detection, version preservation, then vague-query expansion.
- Make vague-query expansion very conservative: only expand 1-3 word coding queries.
- Version awareness in v1 should only use versions already present in the user query; do not inspect repo files.
- Dedup should be conservative and deterministic: normalize URLs, detect obvious duplicates, keep the first Exa-ranked result by default.
- Allow only tiny, high-confidence official-source preference overrides later if needed; do not build a domain scoring system now.
- Snippet cleanup should remove only obvious boilerplate/noise, not attempt semantic rewriting.
- Smart-search logic must fail open: if heuristics fail, use the original query/results and continue.
- Show enhancement/dedup notes only when behavior changed.

## Components
- `enhanceQuery(input, options)` pure function
  - Detects error-like queries
  - Preserves explicit versions already present in the query
  - Conservatively expands vague short coding queries
  - Returns structured metadata: original query, final query, changed/not changed, reason, and optional search-type override
- `postProcessResults(results)` pure function
  - Normalizes URLs for duplicate detection
  - Removes obvious duplicate results while preserving rank order
  - Cleans high-confidence snippet noise
  - Returns cleaned results plus metadata such as duplicate count removed
- `web_search` orchestration integration
  - Normalize params as today
  - Run query enhancement before Exa call
  - Run post-processing after Exa returns
  - Format/store results as today, with short conditional notes when changes occurred
- Supporting helpers
  - URL normalization helper
  - Error-pattern detector
  - Conservative vague-query detector/expander
  - Snippet cleanup helper

## Testing Strategy
Primary coverage should be pure unit tests. Query-enhancement tests should verify each rule independently: error-like inputs force keyword search, explicit versions in the query are preserved, and vague 1-3 word coding queries expand in a controlled way. Negative tests are equally important: normal specific queries should remain unchanged, non-coding short queries should not be expanded, and absent versions should not be invented.

Post-processing tests should feed in mocked Exa results containing duplicate URLs, tracking parameters, mirror-like paths, breadcrumb-heavy snippets, and boilerplate summary text. Tests should assert that only obvious duplicates collapse, first-ranked results are preserved by default, and snippet cleanup removes noise without damaging valid content. Fail-open tests should cover malformed URLs, missing snippets, and unexpected result shapes without crashing or dropping unrelated results.

A small number of integration tests should exercise `web_search` end to end: unchanged queries keep current behavior, changed queries show conditional metadata, and deduped results are reflected in final formatted output. The success criteria for this feature are predictable improvements, transparent behavior when changes occur, and zero regressions to existing search semantics.