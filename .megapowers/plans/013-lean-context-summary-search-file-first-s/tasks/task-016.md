---
id: 16
title: File-first temp files are cleaned up on session shutdown
status: approved
depends_on:
  - 11
no_test: true
files_to_modify: []
files_to_create: []
---

### Task 16: File-first temp files are cleaned up on session shutdown [no-test] [depends: 11]

**AC covered:** AC 18

**Justification:** Existing behavior is already covered by unit tests in `offload.test.ts`; this task verifies that coverage plus the shutdown call site wiring in `index.ts`.
**Files:**
- None

**Step 1 — Verify existing cleanup coverage and wiring**

Run:
- `npx vitest run offload.test.ts -t "removes all tracked temp files"`
- `grep -n "cleanupTempFiles\(\)" index.ts`

Expected:
- Vitest command PASS.
- Grep output shows `cleanupTempFiles()` in session shutdown handler.
