# 035 — Replace unmaintained `pdf-parse` with `unpdf`

## Summary
Swapped the PDF text-extraction backend in `extract.ts` from `pdf-parse@2.4.5` (unmaintained, CJS-interop, latent init-time fixture read of `./test/data/05-versions-space.pdf`) to `unpdf@^1.6.2` (zero-deps, ESM, serverless build of Mozilla `pdf.js`). External behaviour preserved.

## Root Cause
Structural / supply-chain, not runtime. `package.json` pinned `pdf-parse@2.4.5` whose CJS bundle wraps an old `pdf.js` fork and triggers an eager `fs.readFile("./test/data/05-versions-space.pdf")` on some installs at module-init — failing on sandboxed FS layouts where that path is absent. The defect lived in dependency identity (`package.json:62` → `package-lock.json:4787`), propagated through the single import at `extract.ts:5` and the only call site in the PDF branch of `extractViaHttp`.

## Fix Approach
1. `npm install unpdf` / `npm uninstall pdf-parse` to refresh `package.json` and `package-lock.json`.
2. Rewrite `extract.ts:5` import to `import { extractText, getDocumentProxy } from "unpdf"`.
3. Replace the `new PDFParse({ data }) → getText() → destroy()` lifecycle inside `extractViaHttp` with the pure-function pair:
   ```ts
   const pdf = await getDocumentProxy(new Uint8Array(buffer));
   const { text: extracted } = await extractText(pdf, { mergePages: true });
   const text = (typeof extracted === "string" ? extracted : extracted.join("\n")).trim();
   ```
   The `try { … } catch { wrap with "Failed to extract text from PDF: …" }` shell and the pre-library size guard are preserved verbatim so existing error-string contracts (`result.error.toContain("PDF")`, empty-PDF and oversized PDF strings) remain stable.
4. Switch `extract.test.ts` PDF cases from raw-bytes-through-mockFetch to `vi.mock("unpdf", …)` deterministic stubs for `extractText` / `getDocumentProxy`.
5. Add `dependencies.test.ts` as a permanent regression guard: asserts `pdf-parse` absent from `dependencies`/`devDependencies` and `unpdf` present in runtime `dependencies`.
6. Update `README.md:283` to reference `unpdf` (linked to `unjs/unpdf`).

## Files Changed
- `extract.ts` — import + PDF branch of `extractViaHttp` (sole consumer; see `symbol_graph("extractViaHttp")`).
- `extract.test.ts` — `vi.mock("unpdf", …)` setup; rewritten valid / corrupt / oversized PDF tests.
- `dependencies.test.ts` — new regression test (2 cases).
- `package.json` — dropped `"pdf-parse": "^2.4.5"`, added `"unpdf": "^1.6.2"`.
- `package-lock.json` — regenerated; `node_modules/pdf-parse` entry removed.
- `README.md:283` — wording updated.
- `.megapowers/plans/035-…/install-footprint.md` — captured `npm pack --dry-run`, `du -sh node_modules/unpdf`, import smoke test, fixture-read scan.

## How to Verify
```bash
npm test                                # 28 files / 407 tests green
npm ls pdf-parse                        # empty
npm ls unpdf                            # unpdf@1.6.2
grep -RIn "test/data" node_modules/unpdf  # no fixture refs
grep -n "pdf-parse\|PDFParse" extract.ts  # no matches
```
External contract (`ExtractedContent` shape, `"Failed to extract text from PDF: …"` error wrapper, `"Response too large"` short-circuit) is unchanged — confirmed by the verify report's per-criterion gate output.
