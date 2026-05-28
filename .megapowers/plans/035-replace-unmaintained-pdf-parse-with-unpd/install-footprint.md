# Install Footprint & Init-Time Safety Evidence

Issue: 035-replace-unmaintained-pdf-parse-with-unpd
Captured: 2026-05-28

## npm pack --dry-run

```
npm notice name: @coctostan/pi-exa-gh-web-tools
npm notice version: 4.1.1
npm notice filename: coctostan-pi-exa-gh-web-tools-4.1.1.tgz
npm notice package size: 70.3 kB
npm notice unpacked size: 304.7 kB
npm notice shasum: 8824f2ba66df5b83ddb092b2103ba62d40c10971
npm notice total files: 65
```

Project tarball is 70.3 kB (304.7 kB unpacked) — runtime deps are not bundled, so the tarball delta from the pdf-parse → unpdf swap is negligible at the publish boundary.

## node_modules/unpdf size

```
2.2M	node_modules/unpdf
```

unpdf ships a serverless build of Mozilla pdf.js with zero transitive dependencies. For reference, the unmaintained `pdf-parse@2.4.5` (previously installed) bundled an older fork of pdf.js plus a CJS shim, sample fixtures, and a `bin/cli.mjs` — comparable order of magnitude but with maintenance / supply-chain wins.

## unpdf import smoke test

```
$ node --input-type=module -e "import('unpdf').then(m => console.log('imported keys:', Object.keys(m).sort().join(', '))).catch(e => { console.error('IMPORT FAILED', e); process.exit(1); })"
imported keys: configureUnPDF, createIsomorphicCanvasFactory, definePDFJSModule, extractImages, extractLinks, extractText, extractTextItems, getDocumentProxy, getMeta, getResolvedPDFJS, renderPageAsImage, resolvePDFJSImport
```

Clean ESM import. Both symbols used by `extract.ts` are present (`extractText`, `getDocumentProxy`). No `ENOENT`, no fixture-read failures at module load — confirming no init-time `./test/data/*.pdf` access of the kind reported for `pdf-parse`.

## fixture-read scan

```
$ grep -RIn "test/data" node_modules/unpdf
no fixture refs
```

No source references to a `test/data` fixture path anywhere under `node_modules/unpdf`. The latent init-time fixture read that motivated this swap is structurally impossible with unpdf.

---

Acceptance criteria #4 (no init-time fixture reads) and #5 (install footprint recorded) satisfied.
