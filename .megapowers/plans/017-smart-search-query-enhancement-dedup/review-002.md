---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
approved_tasks:
  - 1
needs_revision_tasks:
  - 2
  - 3
  - 4
---

### Task 1: Pass keyword search type through Exa request body — ✅ PASS
No issues.

### Task 2: Add rule-based query enhancement helpers — ❌ REVISE
- AC4 coverage is too weak: the current version-preservation test uses `"react 19 hooks"` and only checks that `"19"` appears somewhere in the rewritten query. Use a real version token and assert it survives exactly.
- Step 3's `looksErrorLike()` matcher is too broad. Matching bare `Error` / `Exception` will incorrectly force keyword search for normal queries such as `"React Error Boundary docs"`. Add a negative control test and narrow the matcher to stack-trace/error-prefix patterns.

### Task 3: Add result dedup and snippet cleanup post-processing — ❌ REVISE
- AC17 is only partially covered. The tests cover malformed URLs but not malformed result entries.
- The proposed implementation will throw on malformed entries before URL normalization because `cleanSnippet(result.snippet)` assumes a string. The function needs per-entry fail-open behavior so later valid results still get deduped and cleaned.
- Coerce malformed `url` / `snippet` values to safe strings before calling cleanup and normalization. That also matches downstream `formatSearchResults()` expectations in `exa-search.ts`.

### Task 4: Integrate smart search into web_search output and fail-open flow — ❌ REVISE
- Step 3 adds a `Removed X duplicate results.` note. That note is outside the acceptance criteria and contradicts the goal of only surfacing transparency notes when search behavior changed.
- Step 1 should add a regression assertion that even when `postProcessResults()` reports duplicates removed, the tool output does not emit a duplicate-removal note.

### Missing Coverage
- AC17 malformed-result-entry handling is not covered by any task as currently written.

Detailed, task-specific fixes have been written to `revise-instructions-2.md`.
