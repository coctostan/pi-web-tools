---
id: 23
title: Bump package.json version to 4.1.0
status: approved
depends_on:
  - 22
no_test: true
files_to_modify:
  - package.json
files_to_create: []
---

Bump the published version. (AC-BATCH-2) [no-test]

**Justification:** Version bump is metadata; no observable behavior change beyond what npm publish surfaces. The other ACs are validated by their own tests.

**Files:**
- Modify: `package.json`

**Step 1 — Make the change**

In `package.json`, change `"version": "4.0.0"` to `"version": "4.1.0"`.

**Step 2 — Verify**
Run: `node -p "require('./package.json').version"`
Expected: `4.1.0`
