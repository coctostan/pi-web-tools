# Bugfix Summary: Replace unmaintained `pdf-parse` with `unpdf`

Issue: 035-replace-unmaintained-pdf-parse-with-unpd

## Root Cause

`extract.ts` extracted PDF text via `pdf-parse@2.4.5` — an unmaintained CJS-shimmed package that bundles an old fork of `pdf.js` and (in some installs) reads a sample fixture (`./test/data/05-versions-space.pdf`) at module-init time. The coupling existed at three levels:

- Source: `import { PDFParse } from "pdf-parse"` plus a `new PDFParse(...) / getText() / destroy()` lifecycle inside `extractViaHttp`.
- Dependency: `"pdf-parse": "^2.4.5"` in `package.json` + pinned tarball in `package-lock.json`.
- Docs: `README.md` advertised `pdf-parse` as the extraction backend.

The defect was structural (dependency identity), not a computed value.

## Fix Approach

Swap the PDF backend to [`unpdf`](https://github.com/unjs/unpdf) — a zero-dependency, ESM-first serverless build of Mozilla `pdf.js` exposing pure functions instead of a class with a destroy lifecycle.

Behavioral contract preserved across the swap:

- `ExtractedContent` return shape (`{ url, title, content, error }`) unchanged.
- Empty-text branch still returns `"Failed to extract text from PDF: no readable text found"`.
- Library-thrown errors still wrapped as `Failed to extract text from PDF: ${msg}` so `expect(result.error).toContain("PDF")` holds.
- Pre-library size guard still returns `"Response too large"` before any parser runs.

New PDF branch (from `extract.ts:109-132`, anchored read):

```ts
// PDF: extract text via unpdf (Mozilla pdf.js, serverless build, no init-time file reads)
if (isPdf(contentType)) {
  try {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_SIZE) return makeErrorResult(url, "Response too large");

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: extracted } = await extractText(pdf, { mergePages: true });
    const text = (typeof extracted === "string" ? extracted : (extracted as string[]).join("\n")).trim();

    if (text.length === 0) {
      return makeErrorResult(url, "Failed to extract text from PDF: no readable text found");
    }
    const title = extractHeadingTitle(text.slice(0, 4096)) || titleFromUrl(url);
    return { url, title, content: text, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return makeErrorResult(url, `Failed to extract text from PDF: ${msg}`);
  }
}
```

The `new PDFParse(...)` / `parser.destroy()` lifecycle is gone — `unpdf`'s document proxy is garbage-collected.

## Files Changed

- `package.json` — drop `pdf-parse`, add `unpdf: ^1.6.2`.
- `package-lock.json` — regenerated; `node_modules/pdf-parse` entry removed.
- `extract.ts` — import + PDF branch swapped to `unpdf`.
- `extract.test.ts` — added `vi.mock("unpdf", …)` and rewrote the three PDF cases to drive the new mock surface.
- `dependencies.test.ts` — new regression test asserting `pdf-parse` is absent and `unpdf` is declared.
- `README.md` — line 283 now references `unpdf` (linked to upstream repo).

`git diff main --stat` summary:

```
README.md              |   2 +-
extract.test.ts        | 142 +++++++++++++++++--------------
extract.ts             |  13 ++-
package-lock.json      | 234 ++++---------------------------------------------
package.json           |   4 +-
```

## How to Verify

1. `npm test` → 26 files / 315 tests pass.
2. `node -e "const p=require('./package.json');console.log(p.dependencies['pdf-parse'], p.dependencies['unpdf']);"` → `undefined ^1.6.2`.
3. `grep -c '"node_modules/pdf-parse"' package-lock.json` → `0`.
4. `npm ls unpdf pdf-parse` → only `unpdf@1.6.2` resolves; `pdf-parse` absent.
5. `grep -n "pdf-parse\|PDFParse" extract.ts` → no matches (only `unpdf` import remains).
6. `find node_modules/unpdf -iname "*.pdf"` → no fixture PDFs shipped.
