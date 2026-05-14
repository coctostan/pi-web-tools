---
id: 1
title: Add unpdf to dependencies
status: approved
depends_on: []
no_test: true
files_to_modify:
  - package.json
  - package-lock.json
files_to_create: []
---

**Justification:** Additive dependency install. Adding `unpdf` without removing `pdf-parse` keeps the repo green and lets Task 2 (the TDD swap) import the new library. The removal of `pdf-parse` is Task 3, after the swap.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1 — Make the change**

Run from the repo root:

```
npm install unpdf
```

This adds `unpdf` to `dependencies` in `package.json` and updates `package-lock.json`. Verify `package.json` `dependencies` now contains an `"unpdf"` entry alongside the existing `"pdf-parse": "^2.4.5"` (still present — Task 3 removes it).

**Step 2 — Verify**

Run: `npm ls unpdf`

Expected: prints `unpdf@<x.y.z>` resolved under `@coctostan/pi-exa-gh-web-tools@4.1.0` with no `UNMET DEPENDENCY` error.

Also run: `npm test`

Expected: all 26 tests still pass — this task is additive only, the `pdf-parse` code path is untouched.
