# Learnings — 016: Freshness + findSimilar

- **`undefined` as a map value requires an `in` guard, not a value check.** `FRESHNESS_MAP["any"] = undefined` means a simple `FRESHNESS_MAP[key]` lookup returns `undefined` for both "any" and missing keys. The `in` operator (`key in FRESHNESS_MAP`) distinguishes them correctly. Using truthiness (`if (FRESHNESS_MAP[key])`) would silently break the `realtime → 0` case since `0` is falsy.

- **Downstream metadata fields can reflect structural assumptions that break in new code paths.** `queryCount: queryList.length` was semantically correct for the batch-query path where `queryList` is always non-empty. Adding a `similarUrl` path that sets `queryList = []` silently broke the TUI display (`"1/0 queries succeeded"`). Always audit all places a variable is consumed when introducing a new code path that changes its value.

- **TDD catches logic bugs but not metadata bugs.** All 15 spec-criterion tests passed, yet `queryCount` was wrong. The spec didn't include a criterion for metadata correctness in `details`, so no test caught it during implementation. Code review found it. Good argument for including UI/display behavior in acceptance criteria, or for reviewers to look beyond the spec.

- **Error-path tests for new functions should be written alongside happy-path tests, not left as an afterthought.** `findSimilarExa` had 3 happy-path tests but zero error-path tests at implementation time. The patterns (null key, HTTP 4xx, network rejection) were directly available in the existing `searchExa` test suite as templates. Requiring parity with sibling functions' test coverage is a good heuristic.

- **`set_line` with multi-line `new_text` can produce surprising results when the first line of `new_text` matches the anchor content.** When replacing `  });` with `"  });\n\n  describe(...)"`, the edit tool dropped the leading `  });`, producing a blank line instead. Always verify file structure after multi-line `set_line` edits, especially when the replacement starts with the same content as the anchor.

- **Batching closely-related small features (XS + S) into a single issue pays off.** `freshness` and `findSimilar` touched the same three files (`tool-params.ts`, `exa-search.ts`, `index.ts`) with the same pattern. Doing them together meant one branch, one PR, one review pass — vs. two separate cycles for 45 minutes of total work.

- **YAGNI holds at 2 call sites.** The `findSimilarExa` function duplicates ~40 lines of `searchExa` (signal setup, retry, error handling, parse). The refactor to a shared `exaPost(url, body, options)` helper is tempting but premature — only two HTTP call sites exist. If a third endpoint is needed, extract then.
