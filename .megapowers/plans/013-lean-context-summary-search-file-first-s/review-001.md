---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 2
  - 3
  - 4
  - 5
  - 6
  - 9
  - 10
  - 11
  - 13
  - 14
  - 16
  - 17
  - 18
  - 19
  - 1
  - 7
  - 8
  - 12
  - 15
approved_tasks:
  - 2
  - 3
  - 4
  - 5
  - 6
  - 9
  - 10
  - 11
  - 13
  - 14
  - 16
  - 17
  - 18
  - 19
needs_revision_tasks:
  - 1
  - 7
  - 8
  - 12
  - 15
---

### Task 1 — ❌ REVISE
- **Step 2 expected failure is incorrect for this repo/tooling.** `vitest` does not type-check TS by default, so failure will be an assertion mismatch on `body.contents`, not a TS compile error about `detail`.
- Update Step 2 failure expectation accordingly.

### Task 2 — ✅ PASS
No blocking issues. Covers AC2 behavior and remains compatible with Task 1/3 sequence.

### Task 3 — ✅ PASS
No blocking issues.

### Task 4 — ✅ PASS
No blocking issues.

### Task 5 — ✅ PASS
No blocking issues.

### Task 6 — ✅ PASS
No blocking issues.

### Task 7 — ❌ REVISE
- **Does not actually validate AC6.** Current test uses a snippet under 200 chars, which passes even with existing truncation logic.
- AC6 requires summary-mode rendering without 200-char truncation; test must use >200 chars and implementation must remove/avoid truncation in `formatSearchResults`.

### Task 8 — ❌ REVISE
- **Coverage is insufficient for AC8/AC9.** Current tests only verify `normalizeWebSearchInput`; they do not verify:
  - schema includes `detail`
  - `web_search` execute passes `detail` to `searchExa`
- Add integration-level assertions in `index.test.ts` with mocked `searchExa` and registered `web_search` tool.

### Task 9 — ✅ PASS
No blocking issues (`[no-test]` doc-only change with verification step present).

### Task 10 — ✅ PASS
No blocking issues.

### Task 11 — ✅ PASS
No blocking issues.

### Task 12 — ❌ REVISE
- **Only updates single-URL prompt fallback.** Multi-URL prompt fallback still inlines/truncates with `MAX_INLINE_CONTENT` in current plan steps.
- AC14 + AC17 require file-first fallback behavior for prompt-failure paths generally; add multi-URL prompt fallback updates and test coverage.

### Task 13 — ✅ PASS
No blocking issues.

### Task 14 — ✅ PASS
No blocking issues.

### Task 15 — ❌ REVISE
- **Dependency issue:** Step 3 modifies multi-URL file-first block introduced in Task 13, but task only depends on Task 11. Add dependency on Task 13.
- Add a mixed multi-URL (GitHub + non-GitHub) test to lock behavior and prevent regressions.

### Task 16 — ✅ PASS
No blocking issues.

### Task 17 — ✅ PASS
No blocking issues.

### Task 18 — ✅ PASS
No blocking issues.

### Task 19 — ✅ PASS
No blocking issues (`[no-test]` doc-only change with verification step present).

### Missing Coverage
- **AC20** has no implementing task. Plan currently marks it as “— No changes needed,” but acceptance still requires regression assurance.
- Add a new task with a focused regression test for the `tool_result` interceptor (especially `code_search` and `get_search_content`) to prove unchanged behavior.

I wrote detailed prescriptive guidance to:
`.megapowers/plans/013-lean-context-summary-search-file-first-s/revise-instructions-1.md`
