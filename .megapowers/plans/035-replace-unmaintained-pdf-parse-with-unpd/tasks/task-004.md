---
id: 4
title: Update README.md to reference unpdf
status: approved
depends_on:
  - 3
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

**Justification:** Documentation-only edit. No observable runtime behavior.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**

Use `grep` to confirm the current wording, then `edit` to replace it.

Current (`README.md:283`):

```
PDF text is extracted with `pdf-parse`. Corrupt, encrypted, empty, or oversized PDFs return a clear error.
```

Replace with:

```
PDF text is extracted with [`unpdf`](https://github.com/unjs/unpdf) (a serverless build of Mozilla `pdf.js`). Corrupt, encrypted, empty, or oversized PDFs return a clear error.
```

If there are any other casual mentions of `pdf-parse` in `README.md` found by `grep -n "pdf-parse" README.md`, replace them with `unpdf` in the same edit.

**Step 2 — Verify**

Run: `grep -n "pdf-parse" README.md`

Expected: no matches.

Run: `grep -n "unpdf" README.md`

Expected: at least one match — the replaced line.
