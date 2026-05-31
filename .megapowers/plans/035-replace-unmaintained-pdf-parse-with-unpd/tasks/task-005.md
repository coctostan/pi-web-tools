---
id: 5
title: Record install footprint and verify no init-time fixture reads
status: approved
depends_on:
  - 3
no_test: true
files_to_modify: []
files_to_create:
  - .megapowers/plans/035-replace-unmaintained-pdf-parse-with-unpd/install-footprint.md
---

**Justification:** Verification/evidence task for acceptance criteria #5 (install size goes down) and #4 (no init-time fixture reads). Evidence belongs to the plan artifact, not the production source tree.

**Files:**
- Create: `.megapowers/plans/035-replace-unmaintained-pdf-parse-with-unpd/install-footprint.md`

**Step 1 — Make the change**

Run the four commands and capture output verbatim into the new file under the headings listed below.

```
npm pack --dry-run 2>&1 | tail -20
```

Captures unpacked tarball size of project.

```
du -sh node_modules/unpdf
```

Captures installed footprint of new library.

```
node --input-type=module -e "import('unpdf').then(m => console.log('imported keys:', Object.keys(m).sort().join(', '))).catch(e => { console.error('IMPORT FAILED', e); process.exit(1); })"
```

Confirms `unpdf` imports cleanly with no `ENOENT`/fixture-read failures.

```
grep -RIn "test/data" node_modules/unpdf || echo "no fixture refs"
```

Confirms no `test/data` runtime references.

Write outputs into `install-footprint.md` under headings:
- `## npm pack --dry-run`
- `## node_modules/unpdf size`
- `## unpdf import smoke test`
- `## fixture-read scan`

End with: "Acceptance criteria #4 (no init-time fixture reads) and #5 (install footprint recorded) satisfied."

**Step 2 — Verify**

Run: `cat .megapowers/plans/035-replace-unmaintained-pdf-parse-with-unpd/install-footprint.md`

Expected: all four sections present and populated; import smoke prints a non-empty `imported keys:` containing at least `extractText` and `getDocumentProxy`; fixture-read scan prints `no fixture refs` or reviewed-and-confirmed-benign matches.
