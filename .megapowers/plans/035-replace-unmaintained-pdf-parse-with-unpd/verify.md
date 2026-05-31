# Verification Report — 035-replace-unmaintained-pdf-parse-with-unpd

## Test Suite Results

`npm test` (vitest run):

```
Test Files  28 passed (28)
Tests       407 passed (407)
Duration    1.32s
```

All suites green, including `extract.test.ts (17 tests)` which covers the PDF branch.

## Per-Criterion Verification

### Criterion 1: `package.json` no longer lists `pdf-parse`; `unpdf` is present with a pinned semver range
**Evidence:** `grep pdf-parse|unpdf package.json` →
```
package.json:63:    "unpdf": "^1.6.2"
```
No `pdf-parse` entry.
**Verdict:** pass

### Criterion 2: `package-lock.json` reflects #1 (no `node_modules/pdf-parse` entry)
**Evidence:**
- `grep -n "pdf-parse" package-lock.json` → no output.
- `ls node_modules/pdf-parse` → `No such file or directory`.
- `npm ls unpdf pdf-parse` → tree shows only `unpdf@1.6.2`.
**Verdict:** pass

### Criterion 3: `extract.ts` imports only `unpdf` for PDF text extraction; no `PDFParse` / `pdf-parse` references in source
**Evidence:** `grep "pdf-parse|unpdf|PDFParse" extract.ts` →
```
extract.ts:5: import { extractText, getDocumentProxy } from "unpdf";
extract.ts:109: // PDF: extract text via unpdf ...
extract.ts:119: const pdf = await getDocumentProxy(new Uint8Array(buffer));
extract.ts:120: const { text: extracted } = await extractText(pdf, { mergePages: true });
```
No `PDFParse` / `pdf-parse` matches anywhere.
**Verdict:** pass

### Criterion 4: PDF branch returns same `ExtractedContent` shape with required error strings
**Evidence:** `extract.ts:110-132` inspected:
- Success: `{ url, title: extractHeadingTitle(...) || titleFromUrl(url), content: text, error: null }` (line 128).
- Empty: `makeErrorResult(url, "Failed to extract text from PDF: no readable text found")` (line 124).
- Library throw: `Failed to extract text from PDF: ${msg}` (line 131) — preserves "PDF" substring.
- Oversized: short-circuits at lines 105-106 / 115-116 with `"Response too large"`.
**Verdict:** pass

### Criterion 5: `extract.test.ts` PDF cases pass with adjusted mocking
**Evidence:** `extract.test.ts:5-20` uses `vi.mock("unpdf", () => ({ extractText: vi.fn(), getDocumentProxy: vi.fn() }))` and re-imports; tests at lines 210, 245, 268 assert mocked behavior. Test run: `extract.test.ts (17 tests) 63ms` all pass.
**Verdict:** pass

### Criterion 6: `npm test` fully green
**Evidence:** 28 files / 407 tests passed (output above). Exceeds the spec's noted baseline of 26/26 due to other workstreams.
**Verdict:** pass

### Criterion 7: No fixture / sample PDF loads at import-time
**Evidence:** `grep -rn "test/data\|05-versions" node_modules/unpdf` → no matches. `unpdf` ships a serverless pdf.js bundle with no fixture reads. Test suite runs cleanly with no `ENOENT` errors.
**Verdict:** pass

### Criterion 8: `README.md` mention updated
**Evidence:** `README.md:283`:
```
PDF text is extracted with [`unpdf`](https://github.com/unjs/unpdf) (a serverless build of Mozilla `pdf.js`). Corrupt, encrypted, empty, or oversized PDFs return a clear error.
```
**Verdict:** pass

### Criterion 9: Install footprint check recorded
**Evidence:** `npm pack --dry-run`:
```
package size: 70.3 kB
unpacked size: 304.7 kB
total files: 65
```
`npm ls unpdf pdf-parse`: only `unpdf@1.6.2` resolved; no `pdf-parse` in graph.
**Verdict:** pass

## Reproduction of Original Symptom
Original symptom: dependency on unmaintained `pdf-parse` (latent init-time fixture read). Post-fix: `pdf-parse` is fully absent from `package.json`, `package-lock.json`, and `node_modules/`. Import path now goes through `unpdf`, which contains no `test/data/*.pdf` references. Symptom no longer reproducible.

## Overall Verdict
**pass** — all 9 acceptance criteria verified with command output / source evidence; full 407-test suite green; original symptom (unmaintained `pdf-parse` dependency) eliminated end-to-end.
