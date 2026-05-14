## Summary

Swap PDF text extraction in `extract.ts` from the unmaintained `pdf-parse@2.4.5` to [`unpdf`](https://github.com/unjs/unpdf) — a zero-dependency, ESM-first serverless build of Mozilla `pdf.js`. The user-visible `ExtractedContent` contract (`{ url, title, content, error }`) and PDF error strings are preserved.

## Why

`pdf-parse@2.4.5` is effectively unmaintained, bundles an old fork of `pdf.js` through a CJS shim into an otherwise ESM project, and has been reported to eagerly read a sample fixture (`./test/data/05-versions-space.pdf`) at module-init time in sandboxed filesystems. The defect is structural — a dependency identity, not a computed value — so the fix is at the source/import/dependency level rather than a single line of logic.

## What changed

- `package.json`: drop `pdf-parse: ^2.4.5`; add `unpdf: ^1.6.2` (zero transitive deps).
- `package-lock.json`: regenerated; no `node_modules/pdf-parse` entry.
- `extract.ts`:
  - Import `{ extractText, getDocumentProxy } from "unpdf"`.
  - Rewrite the PDF branch of `extractViaHttp` to `getDocumentProxy(new Uint8Array(buffer))` + `extractText(pdf, { mergePages: true })`.
  - Drop the `new PDFParse(...)` / `try/finally` + `parser.destroy()` lifecycle — unpdf's proxy is GC'd.
  - Normalize `text: string | string[]` from `mergePages: true` and preserve `.trim()`.
- `extract.test.ts`: switch the three PDF cases to `vi.mock("unpdf", …)` with deterministic `extractText` / `getDocumentProxy` stubs (the prior hand-crafted minimal PDF was borderline for real pdf.js).
- `dependencies.test.ts` (new): regression guard asserting `pdf-parse` is absent from `dependencies`/`devDependencies` and `unpdf` is declared.
- `README.md:283`: PDF extraction line now points at `unpdf` instead of `pdf-parse`.

## Behavioral contracts preserved

- Success: non-empty `content`, `error: null`, `title` derived from `extractHeadingTitle(text.slice(0, 4096)) || titleFromUrl(url)`.
- Empty extraction: `error: "Failed to extract text from PDF: no readable text found"`.
- Library-thrown error: `error` starts with `"Failed to extract text from PDF: "` so `expect(result.error).toContain("PDF")` still holds.
- Oversized PDF: pre-library size guard still returns `"Response too large"` before any parser runs.

## Testing

- `npm test` — 26 files / 315 tests passed.
- `npx vitest run extract.test.ts -t "PDF"` — all 3 PDF cases pass against the new `unpdf` mock surface.
- `npx vitest run dependencies.test.ts` — new regression tests green.

## Footprint / fixture-read evidence

- `npm ls unpdf pdf-parse` → only `unpdf@1.6.2` resolves; `pdf-parse` absent from the tree.
- `grep -c '"node_modules/pdf-parse"' package-lock.json` → `0`.
- `find node_modules/unpdf -iname "*.pdf"` → no matches; no sample fixtures shipped or loaded at import.
- `npm pack --dry-run` → publish tarball: 62.2 kB packed, 276.5 kB unpacked, 59 files.

Resolves 035-replace-unmaintained-pdf-parse-with-unpd
