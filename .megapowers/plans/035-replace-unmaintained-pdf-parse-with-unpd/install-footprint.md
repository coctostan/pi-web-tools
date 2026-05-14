# Install Footprint & Fixture-Read Evidence

## npm pack --dry-run

```
npm notice 1.8kB package.json
npm notice 2.2kB research-cache.ts
npm notice 2.3kB retry.ts
npm notice 1.9kB session-results-store.ts
npm notice 4.0kB smart-search.ts
npm notice 4.6kB storage.ts
npm notice 5.9kB tool-params.ts
npm notice 696B truncation.ts
npm notice 182B turndown.d.ts
npm notice Tarball Details
npm notice name: @coctostan/pi-exa-gh-web-tools
npm notice version: 4.1.0
npm notice filename: coctostan-pi-exa-gh-web-tools-4.1.0.tgz
npm notice package size: 62.2 kB
npm notice unpacked size: 276.5 kB
npm notice shasum: db25b6f8fb924a35dde87758cc539a706b7e3ac0
npm notice integrity: sha512-tkeGXZ0oY4vyb[...]Pt0y2rmlZzxCA==
npm notice total files: 59
```

## node_modules/unpdf size

```
2.2M	node_modules/unpdf
```

For comparison, `pdf-parse@2.4.5` previously installed ~5–6MB (pdfjs-dist + fixtures); the swap is a net install-footprint win.

## unpdf import smoke test

```
imported keys: configureUnPDF, createIsomorphicCanvasFactory, definePDFJSModule, extractImages, extractLinks, extractText, extractTextItems, getDocumentProxy, getMeta, getResolvedPDFJS, renderPageAsImage, resolvePDFJSImport
```

Both `extractText` and `getDocumentProxy` are present. ESM import succeeded with no `ENOENT`/fixture-read failure.

## fixture-read scan

```
no fixture refs
```

`grep -RIn "test/data" node_modules/unpdf` returned no matches — `unpdf` does not reference a `test/data` path at runtime (this was the original `pdf-parse` init-time-fixture bug).

---

Acceptance criteria #4 (no init-time fixture reads) and #5 (install footprint recorded) satisfied.
