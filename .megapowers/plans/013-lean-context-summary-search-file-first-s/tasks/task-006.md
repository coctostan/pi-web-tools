---
id: 6
title: parseExaResults produces empty snippet when no summary and no highlights
status: approved
depends_on:
  - 4
no_test: true
files_to_modify: []
files_to_create: []
---

### Task 6: parseExaResults produces empty snippet when no summary and no highlights [no-test] [depends: 4]

**AC covered:** AC 7 (owned by Task 4 fallback-order test)

**Justification:** Redundant fallback coverage now lives in Task 4’s single parser-order test, including the title/url-only case with `expect(results[0].snippet).toBe("");`.
**Files:**
- None

**Step 1 — Verify empty-snippet fallback coverage**

Run: `npx vitest run exa-search.test.ts -t "maps snippet fallback order summary -> highlights -> text -> empty string"`

Expected: PASS.
