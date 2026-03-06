## Goal
Add a small, rule-based smart-search layer to `web_search` that improves search quality without changing the external tool API. The feature should rewrite only clearly improvable queries, remove only obvious duplicate or noisy results, preserve current behavior when no rule applies, and expose short transparency notes only when the search behavior changed.

## Acceptance Criteria
1. `web_search` keeps its existing input schema and does not require any new user-facing parameters for smart-search behavior.
2. A query that matches the tool’s error-like pattern rules is sent to Exa with search type `keyword`.
3. When an error-like query changes search behavior, the formatted tool output includes a note that keyword search was used.
4. A query containing an explicit version string preserves that version in the final searched query.
5. Smart-search logic does not invent a version when the user query contains no explicit version string.
6. A vague coding query of 1–3 words is expanded into a more specific searched query.
7. A query that is already specific is not expanded.
8. A short query that does not look coding-related is not expanded.
9. When the searched query differs from the user’s original query, the formatted tool output includes a `Searched as:` note showing the final query.
10. When the searched query is unchanged, the formatted tool output does not include a `Searched as:` note.
11. Post-processing removes later results that normalize to the same canonical URL as an earlier result.
12. Deduplication preserves the first Exa-ranked result when removing duplicates.
13. URL deduplication ignores common tracking query parameters when determining whether two results are duplicates.
14. Post-processing removes high-confidence snippet noise such as breadcrumb-style prefixes or boilerplate `last updated` text.
15. Post-processing does not remove or rewrite normal result snippets that do not match configured noise patterns.
16. If query enhancement encounters an internal parsing or rule error, `web_search` continues using the original query instead of failing the request.
17. If result post-processing encounters a malformed URL or malformed result entry, it skips the failing normalization step for that entry and continues processing the remaining results.
18. Existing `web_search` behavior remains unchanged for queries where no enhancement rule matches and no result post-processing rule applies.

## Out of Scope
- Model-based query rewriting
- Reading local repo files to infer package or library versions
- Semantic clustering of search results
- Re-ranking results beyond removing obvious later duplicates
- Adding a debug mode or new user-facing smart-search configuration
- Aggressive snippet summarization or semantic rewriting
- Changes to `code_search` or `fetch_content`

## Open Questions
