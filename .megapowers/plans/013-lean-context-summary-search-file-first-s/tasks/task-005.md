---
id: 5
title: parseExaResults still maps highlights to snippet when summary is absent
status: approved
depends_on:
  - 4
no_test: true
files_to_modify: []
files_to_create: []
---

### Task 5: parseExaResults still maps highlights to snippet when summary is absent [no-test] [depends: 4]

**AC covered:** AC 5 (owned by Task 4 fallback-order test)

**Justification:** Redundant compatibility coverage now lives in Task 4, which asserts parser fallback order `summary -> highlights -> text -> ""`.
**Files:**
- None

**Step 1 — Verify compatibility coverage**

Run: `npx vitest run exa-search.test.ts -t "parses highlights response into snippet"`

Expected: PASS.
