# Verify: 035-replace-unmaintained-pdf-parse-with-unpd

## Test Suite Results

`npm test` — full suite green:

```
Test Files  26 passed (26)
     Tests  315 passed (315)
  Duration  2.63s
```

Note: the spec mentioned "currently 26/26" referring to test files. Test files: 26 passed. Individual tests: 315 passed (the suite has grown since the spec was written). No failures.

## Step 1b — Reproduce original symptom

Original symptom: project depends on unmaintained `pdf-parse@2.4.5` with init-time fixture read. Reproduction is dependency-identity inspection.

```
$ node -e "const p=require('./package.json');console.log('pdf-parse:',p.dependencies['pdf-parse']);console.log('unpdf:',p.dependencies['unpdf']);"
pdf-parse: undefined
unpdf: ^1.6.2

$ grep -c '"node_modules/pdf-parse"' package-lock.json
0

$ ls node_modules/pdf-parse
ls: node_modules/pdf-parse: No such file or directory

$ grep -rn "pdf-parse\|PDFParse" --include="*.ts" .
./dependencies.test.ts:13:  it("does not depend on the unmaintained pdf-parse package", () => {
./dependencies.test.ts:14:    expect(pkg.dependencies?.["pdf-parse"]).toBeUndefined();
./dependencies.test.ts:15:    expect(pkg.devDependencies?.["pdf-parse"]).toBeUndefined();
```

The only remaining mentions of `pdf-parse` in `*.ts` are the regression test that asserts it is *absent*. Symptom (dependency identity = pdf-parse) no longer reproduces.

## Per-Criterion Verification

### Criterion 1: `pdf-parse` removed; `unpdf` pinned in `dependencies`
**Evidence:** `package.json` resolves `dependencies['pdf-parse'] = undefined` and `dependencies['unpdf'] = ^1.6.2` (see node -e output above).
**Verdict:** pass

### Criterion 2: `package-lock.json` reflects #1
**Evidence:** `grep -c '"node_modules/pdf-parse"' package-lock.json` → `0`. `grep -n '"node_modules/unpdf"' package-lock.json` → `5317:    "node_modules/unpdf": {`. `ls node_modules/pdf-parse` → No such file or directory.
**Verdict:** pass

### Criterion 3: `extract.ts` imports only `unpdf`; no `PDFParse`/`pdf-parse` references remain in source
**Evidence:**
```
$ grep -n "pdf-parse\|PDFParse\|unpdf" extract.ts
extract.ts:5:import { extractText, getDocumentProxy } from "unpdf";
extract.ts:109:  // PDF: extract text via unpdf (...)
```
Repo-wide `grep -rn "pdf-parse\|PDFParse" --include="*.ts"` only matches the regression test in `dependencies.test.ts`. No `PDFParse` symbol or `pdf-parse` import anywhere in source.
**Verdict:** pass

### Criterion 4: PDF branch preserves `ExtractedContent` shape and error contracts
**Evidence:** `extract.ts:109-133` (read fresh):
- 119–121: `getDocumentProxy(new Uint8Array(buffer))` + `extractText(pdf, { mergePages: true })`; normalizes `string | string[]` then `.trim()`.
- 123–125: empty-text branch returns `"Failed to extract text from PDF: no readable text found"`.
- 127–128: success returns `{ url, title: extractHeadingTitle(text.slice(0,4096)) || titleFromUrl(url), content: text, error: null }`.
- 129–131: catch wraps as `` `Failed to extract text from PDF: ${msg}` `` so `toContain("PDF")` holds.
- Oversized guard at 105–107 and 115–117 unchanged, pre-library, returns `"Response too large"`.
**Verdict:** pass

### Criterion 5: `extract.test.ts` PDF cases pass against `unpdf` via `vi.mock`
**Evidence:**
```
$ npx vitest run extract.test.ts -t "PDF"
 ✓ extract.test.ts (17 tests | 14 skipped) 5ms
 Tests  3 passed | 23 skipped (26)
```
Three PDF tests pass. `extract.test.ts:5-8` declares `vi.mock("unpdf", ...)` stubbing `extractText` and `getDocumentProxy`.
**Verdict:** pass

### Criterion 6: `npm test` full suite green
**Evidence:** see top — 26 files / 315 tests passed, 0 failures.
**Verdict:** pass

### Criterion 7: No fixture PDFs loaded at module import
**Evidence:** `find node_modules/unpdf -iname "*.pdf"` returned no matches. Full test suite ran with cwd lacking any `./test/data/` and produced no ENOENT errors. Tests passing implies no import-time crashes.
**Verdict:** pass

### Criterion 8: `README.md:283` updated
**Evidence:**
```
$ grep -n "pdf-parse\|unpdf" README.md
README.md:283:PDF text is extracted with [`unpdf`](https://github.com/unjs/unpdf) (a serverless build of Mozilla `pdf.js`). Corrupt, encrypted, empty, or oversized PDFs return a clear error.
```
**Verdict:** pass

### Criterion 9: Install footprint check executed/recorded
**Evidence:**
```
$ npm ls unpdf pdf-parse
@coctostan/pi-exa-gh-web-tools@4.1.0
└── unpdf@1.6.2

$ npm pack --dry-run | tail -5
npm notice package size: 62.2 kB
npm notice unpacked size: 276.5 kB
npm notice total files: 59
```
`pdf-parse` is absent from the dependency tree; `unpdf@1.6.2` is the sole PDF dependency (zero transitive deps).
**Verdict:** pass

## Overall Verdict
**pass**

All 9 acceptance criteria verified with fresh command output from this session. Full test suite (26 files / 315 tests) green. Original symptom (dependency on `pdf-parse`) no longer reproduces — package is absent from `package.json`, `package-lock.json`, and `node_modules/`. PDF extraction now flows through `unpdf` via `getDocumentProxy` + `extractText` while preserving the `ExtractedContent` shape and `"Failed to extract text from PDF: …"` error wrapper required by callers and tests.
