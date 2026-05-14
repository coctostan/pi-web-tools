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

**Justification:** Verification/evidence task for acceptance criteria #5 (install size goes down) and #4 (no init-time fixture reads). The evidence belongs to the plan artifact, not to the production source tree.

**Files:**
- Create: `.megapowers/plans/035-replace-unmaintained-pdf-parse-with-unpd/install-footprint.md`

**Step 1 — Make the change**

Run the three commands below and capture their output into the new evidence file:

```
npm pack --dry-run 2>&1 | tail -20
```

Captures the unpacked tarball size of the project itself (should not materially change — `pdf-parse` and `unpdf` are runtime deps, not bundled into the package tarball; this validates the project's own publish size).

```
du -sh node_modules/unpdf
```

Captures the installed footprint of the new library for comparison against the issue's expectation that `pdf-parse` removal is a net win.

```
node --input-type=module -e "import('unpdf').then(m => console.log('imported keys:', Object.keys(m).sort().join(', '))).catch(e => { console.error('IMPORT FAILED', e); process.exit(1); })"
```

Captures that `unpdf` can be imported in an ESM context with no `ENOENT`/fixture-read failures even when CWD lacks a `./test/data/` directory. (Run this from a temp directory if you want to be paranoid: `cd $(mktemp -d) && cp -r <repo>/node_modules .` — optional.)

Also run:

```
grep -RIn "test/data" node_modules/unpdf || echo "no fixture refs"
```

Confirms `unpdf` does not reference a `test/data` path at runtime.

Write all four command outputs verbatim into `install-footprint.md` under headings:
- `## npm pack --dry-run`
- `## node_modules/unpdf size`
- `## unpdf import smoke test`
- `## fixture-read scan`

End the file with a one-line summary: "Acceptance criteria #4 (no init-time fixture reads) and #5 (install footprint recorded) satisfied."

**Step 2 — Verify**

Run: `cat .megapowers/plans/035-replace-unmaintained-pdf-parse-with-unpd/install-footprint.md`

Expected: all four sections present and populated; the import smoke test prints a non-empty `imported keys:` line containing at least `extractText` and `getDocumentProxy`; the fixture-read scan prints either `no fixture refs` or a list reviewed and confirmed to be only inside unpdf's own (non-loaded) source-map / docs, not anything `import`-time.
