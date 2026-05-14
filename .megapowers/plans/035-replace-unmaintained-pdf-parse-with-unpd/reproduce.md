# Reproduction: pdf-parse@2.4.5 is unmaintained and bundled — hygiene/security swap to `unpdf`

## Summary

This issue is a **hygiene/security swap**, not a runtime crash. The current test suite passes (26/26); however the underlying conditions called out in the issue are reproducible by inspection of the installed dependency and code path.

## Steps to Reproduce

1. Clone the repo at the current commit and run `npm install`.
2. Inspect the installed `pdf-parse` dependency:
   ```
   npm ls pdf-parse
   cat node_modules/pdf-parse/package.json
   ```
3. Inspect the PDF extraction code path in `extract.ts` (lines 5, 110–135).
4. Run the test suite:
   ```
   npm test
   ```

## Expected Behavior

- PDF text extraction is performed by a **maintained**, ESM-first library with no init-time file reads and a small, audited surface (per acceptance criteria: `unpdf`).
- `package.json` lists `unpdf` instead of `pdf-parse`.
- `extract.ts` calls the new library; its public surface (`extractContent` return shape, error semantics) is unchanged.
- `extract.test.ts` PDF cases (valid / corrupt / oversized) still pass against the new library.
- No init-time fixture files loaded by the PDF library at import.

## Actual Behavior

- `package.json` still depends on `pdf-parse@^2.4.5` (issue lines 11, 26).
- `extract.ts:5` imports `{ PDFParse } from "pdf-parse"`, and lines 111, 120–134 use `new PDFParse({ data: buffer })` + `parser.getText()` + `parser.destroy()`.
- Installed pdf-parse is `2.4.5` (verified via `npm ls pdf-parse`):
  ```
  @coctostan/pi-exa-gh-web-tools@4.1.0 /Users/maxwellnewman/pi/workspace/pi-web-tools
  └── pdf-parse@2.4.5
  ```
- The library is reported in the issue as effectively unmaintained, bundling an old fork of pdf.js, and in some installs eagerly loading a sample PDF at module init time — a real risk on sandboxed file systems.
- Tests currently pass — no runtime regression to reproduce; the defect is **supply-chain hygiene** and **latent init-time side effects**, both visible from the dependency tree and source.

## Evidence

### Dependency state

```
$ npm ls pdf-parse
@coctostan/pi-exa-gh-web-tools@4.1.0 /Users/maxwellnewman/pi/workspace/pi-web-tools
└── pdf-parse@2.4.5

$ cat node_modules/pdf-parse/package.json | jq '{name,version,main,type}'
{
  "name":    "pdf-parse",
  "version": "2.4.5",
  "main":    "dist/pdf-parse/cjs/index.cjs",
  "type":    "module"
}
```

### Code path using pdf-parse (`extract.ts`)

- Line 5:  `import { PDFParse } from "pdf-parse";`
- Line 111: `let parser: InstanceType<typeof PDFParse> | null = null;`
- Line 120: `parser = new PDFParse({ data: buffer });`
- Line 121: `const parsed = await parser.getText();`
- Line 122: `const text = parsed.text?.trim() || "";`
- Line 134: `await parser?.destroy().catch(() => {});`

The PDF block (lines 110–136) is the entire surface that needs to swap to `unpdf`'s `extractText(buffer)` returning `{ text, totalPages }`.

### Test state (current behavior, baseline)

```
$ npx vitest run extract.test.ts
 ✓ github-extract.test.ts (9 tests) 2ms
 ✓ extract.test.ts        (17 tests) 85ms

 Test Files  2 passed (2)
      Tests  26 passed (26)
```

Relevant PDF tests already exist (`extract.test.ts`):
- `"extracts text from PDF content-type"` (lines 183–213) — builds a minimal valid PDF buffer.
- `"returns error for corrupt PDF without binary garbage"` (lines 215–243).
- `"rejects PDF that exceeds MAX_SIZE"` (lines 245–259).

These will need their mocking strategy updated to target `unpdf` (per acceptance criteria) but the assertions on the public surface stay the same.

## Environment

- Repo: `pi-web-tools` (`@coctostan/pi-exa-gh-web-tools@4.1.0`)
- Node ESM (`"type": "module"` in dependent)
- Test runner: vitest (`npm test` → `vitest run`)
- Current `pdf-parse` installed: `2.4.5`
- Target replacement: `unpdf` (Mozilla pdf.js repackaged, ESM-first, no init-time file reads)

## Failing Test

**Not feasible as a runtime failing test yet** because:

1. The defect is dependency hygiene + latent init-time side effects, not an observable behavioral regression in the current sandbox — the existing test suite is green against pdf-parse.
2. A meaningful failing test would be a dependency-level assertion (e.g. "`pdf-parse` must not appear in `package.json` dependencies", "no init-time fixture loaded under `node_modules/pdf-parse/test/data/`"). That belongs in the implement phase along with the swap itself, otherwise it pins the current bad state.
3. Behavioral PDF tests already exist and will be re-pointed at `unpdf` during implement (see acceptance criteria #3).

Plan for implement phase: keep the existing public-surface assertions in `extract.test.ts` PDF cases, swap their mocks to `unpdf.extractText`, and add a guard test that `package.json` no longer lists `pdf-parse`.

## Reproducibility

**Always** — the unmaintained dependency and the `PDFParse` call site are deterministically present at the current commit. The init-time PDF-load side-effect described in the issue is environment-dependent (sandboxed file systems with strict permissions), but the conditions enabling it (use of `pdf-parse@2.4.5`) are reproducible 100% of the time.
