---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 3
  - 4
  - 7
  - 9
  - 10
  - 11
  - 13
  - 19
  - 2
  - 5
  - 6
  - 8
  - 12
  - 14
  - 15
  - 16
  - 17
  - 18
  - 20
approved_tasks:
  - 1
  - 3
  - 4
  - 7
  - 9
  - 10
  - 11
  - 13
  - 19
needs_revision_tasks:
  - 2
  - 5
  - 6
  - 8
  - 12
  - 14
  - 15
  - 16
  - 17
  - 18
  - 20
---

### Task 1: searchExa sends summary contents when detail is "summary" — ✅ PASS
Clear RED→GREEN flow, correct API usage (`searchExa`, request body assertions), and scoped implementation.

### Task 2: searchExa sends highlights contents when detail is "highlights" — ❌ REVISE
- **TDD issue:** Step 2 expects PASS instead of a failing RED state.
- Task is currently redundant with later coverage and should be converted to no-test/merged coverage per revise instructions.

### Task 3: searchExa defaults to summary mode when detail is omitted — ✅ PASS
Good sequencing after Task 1, and updates existing tests affected by default switch.

### Task 4: parseExaResults maps summary field to snippet — ✅ PASS
Correctly targets parser behavior and uses realistic Exa payload shape.

### Task 5: parseExaResults still maps highlights to snippet when summary is absent — ❌ REVISE
- **TDD issue:** Step 2 expects PASS.
- Should be converted to no-test/merged into Task 4 compatibility coverage.

### Task 6: parseExaResults produces empty snippet when no summary and no highlights — ❌ REVISE
- **TDD issue:** Step 2 expects PASS.
- Should be handled as no-test/merged parser coverage instead of fake RED/GREEN.

### Task 7: formatSearchResults does not truncate summary snippets — ✅ PASS
Single behavior, clear failing assertion, minimal implementation.

### Task 8: web_search tool schema includes detail parameter and passes it to searchExa — ❌ REVISE
- Bundles AC8 and AC9 into one test path.
- Missing explicit normalization tests for `detail` in `tool-params.test.ts` (invalid values should be dropped).

### Task 9: Update web_search tool description to mention summary default — ✅ PASS
Valid no-test task with concrete text change and verification command.

### Task 10: Add FILE_FIRST_PREVIEW_SIZE constant to offload.ts — ✅ PASS
Well-scoped constant export + direct test coverage.

### Task 11: fetch_content single URL without prompt writes to temp file and returns preview + path — ✅ PASS
Core file-first single-url raw path is correctly targeted and uses existing APIs.

### Task 12: fetch_content prompt fallback writes to temp file instead of inlining — ❌ REVISE
- Current test only covers **multi-URL** fallback.
- AC14/AC17 require prompt-fallback file-first behavior broadly; single-URL prompt fallback path in `index.ts` still uses `MAX_INLINE_CONTENT` unless explicitly changed.

### Task 13: fetch_content multi-URL without prompt writes each to its own temp file — ✅ PASS
Good multi-URL raw path coverage and clear expected behavior.

### Task 14: fetch_content with prompt and successful filter returns inline without writing file — ❌ REVISE
- **TDD issue:** Step 2 expects PASS.
- Should be converted to no-test/verification (or merged), since this path is already established behavior.

### Task 15: GitHub clone results are returned inline without file-first — ❌ REVISE
- Implementation guidance uses `parseGitHubUrl(r.url)` at render/output time, which can misclassify GitHub URLs that fell back to normal extraction.
- Needs success-tracking of actual GitHub clone extraction results and explicit single-URL GitHub test coverage.

### Task 16: File-first temp files are cleaned up on session shutdown — ❌ REVISE
- **TDD issue:** Step 2 expects PASS.
- Either make this a true integration RED/GREEN, or convert to no-test verification tied to existing cleanup coverage and shutdown call site.

### Task 17: get_search_content still returns full content from in-memory store after file-first — ❌ REVISE
- **TDD issue:** Step 2 expects PASS.
- Should be framed as no-test verification or redesigned for real RED/GREEN.

### Task 18: fetch_content returns inline with warning when temp file write fails — ❌ REVISE
- **TDD issue:** Step 2 expects PASS because Task 11 already adds the single-url catch.
- To preserve TDD, target multi-URL write-failure fallback (currently weaker) for RED→GREEN.

### Task 19: Update fetch_content tool description to mention file-first behavior — ✅ PASS
Valid no-test documentation task with explicit text update.

### Task 20: tool_result interceptor remains unchanged for code_search/get_search_content offloading — ❌ REVISE
- Re-declares `offloadState` mock shape that will conflict with earlier `index.test.ts` mock setup.
- Missing dependency on Task 11/shared mock changes.
- Needs single mock definition extension, not duplicate declarations.

### Missing Coverage
- **AC14** is not fully locked for **single-URL prompt fallback** file-first behavior.
- **AC17** is not fully locked for prompt fallback paths (single-URL path can still retain `MAX_INLINE_CONTENT` without an explicit test/change).
- **AC15** lacks explicit single-URL GitHub clone regression test (only mixed multi-url is proposed).

I wrote prescriptive fix instructions to:
`.megapowers/plans/013-lean-context-summary-search-file-first-s/revise-instructions-2.md`
with concrete per-task changes and code snippets.
