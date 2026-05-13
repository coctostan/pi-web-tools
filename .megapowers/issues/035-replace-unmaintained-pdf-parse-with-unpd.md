---
id: 35
type: bugfix
status: open
created: 2026-05-13T15:50:54.040Z
priority: 3
---
# Replace unmaintained pdf-parse with unpdf for PDF text extraction
## Problem

`extract.ts` uses `pdf-parse@^2.4.5` to extract text from PDF URLs. Issues:

- `pdf-parse` is effectively unmaintained — minimal updates, no recent security work.
- It eagerly loads a sample PDF (`./test/data/05-versions-space.pdf`) at module init time in some installs, which fails on sandboxed environments and has bitten pi users with strict file-permission setups.
- It bundles an old fork of `pdf.js`.

Modern, well-maintained ESM-first alternatives exist:

- **`unpdf`** — Mozilla `pdf.js` repackaged for serverless/edge; zero init-time file reads; small, audited.
- **`pdfjs-dist`** (official Mozilla) — heavier but canonical.

`unpdf` is the cleanest swap; the API is a single `extractText(buffer)` returning `{ text, totalPages }`.

## Acceptance criteria

- `pdf-parse` removed from `dependencies`; `unpdf` added.
- `extract.ts` PDF path updated; the existing public surface (return type, error semantics) is unchanged.
- `extract.test.ts` cases for corrupt/encrypted/empty/oversized PDFs still pass — adjust mocking strategy to the new library.
- No new init-time side effects (no fixture files loaded by the library at import).
- `package.json` install size goes down (verify with `npm pack --dry-run` or `npm ls`).

## Files likely touched

- `package.json`
- `extract.ts`
- `extract.test.ts`

## Notes

This is a security/hygiene swap; behavior is meant to be identical. Worth a small note in the next changelog entry.

