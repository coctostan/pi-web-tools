---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 2
  - 4
  - 1
  - 3
approved_tasks:
  - 2
  - 4
needs_revision_tasks:
  - 1
  - 3
---

## Per-Task Assessment

### Task 1: Pass keyword search type through Exa request body — ❌ REVISE
Step 2 will not fail. The existing `exa-search.ts:97` code (`if (options.type && options.type !== "auto")`) already passes through `"keyword"` at runtime. The `as any` cast bypasses TypeScript, so the test passes immediately without code changes. The expected failure `AssertionError: expected undefined to be 'keyword'` will NOT occur. This task should be `no-test: true` with `tsc --noEmit` verification since it's a pure type-level change.

### Task 2: Add rule-based query enhancement helpers — ✅ PASS
Tests are correct. Implementation logic verified. All assertions match expected behavior.

### Task 3: Add result dedup and snippet cleanup post-processing — ❌ REVISE
Two issues:
1. **Breadcrumb regex bug:** `[^.]*?` (non-greedy) in `cleanSnippet` only strips `"Docs > API > "`, leaving `"fetch_content"` in the output. Test expects `"Returns the fetched page."` but actual result will be `"fetch_content Returns the fetched page."`. Fix: change `[^.]*?` to `[^.]*` (greedy).
2. **Step 1 import placement:** The append block includes `import` statements that would appear mid-file — invalid ES module syntax. Imports must be added at the top of the file in Step 1, not appended below the existing tests.

### Task 4: Integrate smart search into web_search — ✅ PASS
Comprehensive integration test covering keyword override, query expansion, fail-open, and unchanged behavior. Implementation is correct. Verified existing index.test.ts tests won't break.

## Missing Coverage
None — all 18 ACs covered.

## Detailed revision instructions written to revise-instructions-1.md.
