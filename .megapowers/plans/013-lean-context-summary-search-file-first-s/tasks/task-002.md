---
id: 2
title: searchExa sends highlights contents when detail is "highlights"
status: approved
depends_on:
  - 1
no_test: true
files_to_modify: []
files_to_create: []
---

### Task 2: searchExa sends highlights contents when detail is "highlights" [no-test] [depends: 1]

**AC covered:** AC 2 (owned by Task 3’s updated highlights-mode test)

**Justification:** Redundant coverage. Task 3 already updates the existing test (`"uses highlights content mode with numSentences 3 and highlightsPerUrl 3"`) to pass `detail: "highlights"`, which directly locks AC2.
**Files:**
- None

**Step 1 — Verify existing coverage passes**

Run: `npx vitest run exa-search.test.ts -t "uses highlights content mode with numSentences 3 and highlightsPerUrl 3"`

Expected: PASS.
