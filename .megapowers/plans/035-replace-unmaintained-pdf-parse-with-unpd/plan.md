# Plan

### Task 1: Add unpdf to dependencies [no-test]

**Justification:** Additive dependency install. Adding `unpdf` without removing `pdf-parse` keeps the repo green and lets Task 2 (the TDD swap) import the new library. The removal of `pdf-parse` is Task 3, after the swap.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1 — Make the change**

Run from the repo root:

```
npm install unpdf
```

This adds `unpdf` to `dependencies` in `package.json` and updates `package-lock.json`. Verify `package.json` `dependencies` now contains an `"unpdf"` entry alongside the existing `"pdf-parse": "^2.4.5"` (still present — Task 3 removes it).

**Step 2 — Verify**

Run: `npm ls unpdf`

Expected: prints `unpdf@<x.y.z>` resolved under `@coctostan/pi-exa-gh-web-tools@4.1.0` with no `UNMET DEPENDENCY` error.

Also run: `npm test`

Expected: all 26 tests still pass — this task is additive only, the `pdf-parse` code path is untouched.

### Task 2: Swap extract.ts PDF branch to unpdf and re-mock PDF tests [depends: 1]

**Files:**
- Modify: `extract.ts`
- Modify: `extract.test.ts`
- Test: `extract.test.ts` (PDF blocks at the existing positions)

**Step 1 — Write the failing test**

Update `extract.test.ts` so the three PDF tests mock `unpdf` instead of relying on `pdf-parse` to silently parse buffers. Add `vi.mock("unpdf", ...)` near the top of the file, and rewrite the bodies of the three PDF tests.

Use `read({ path: "extract.ts", symbol: "extractViaHttp" })` first to confirm the current signature/return shape and the exact error strings.

At the top of `extract.test.ts`, just below the existing imports, add:

```ts
vi.mock("unpdf", () => ({
  extractText: vi.fn(),
  getDocumentProxy: vi.fn(async (buf: Uint8Array) => ({ __mockPdf: true, byteLength: buf.byteLength })),
}));

// Import after vi.mock so the mock is in place.
import { extractText, getDocumentProxy } from "unpdf";
```

Replace the **valid PDF** test (currently `"extracts text from PDF content-type"`, `extract.test.ts:183-213`) with:

```ts
it("extracts text from PDF content-type", async () => {
  const pdfBuffer = Buffer.from("%PDF-1.0\n%%EOF");

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/pdf",
      "content-length": String(pdfBuffer.length),
    }),
    arrayBuffer: async () =>
      pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength),
    text: async () => pdfBuffer.toString("binary"),
  });

  vi.mocked(extractText).mockResolvedValueOnce({
    totalPages: 1,
    text: "Hello PDF World",
  });

  const result = await extractContent("https://example.com/doc.pdf");
  expect(result.url).toBe("https://example.com/doc.pdf");
  expect(result.error).toBeNull();
  expect(result.content).toBe("Hello PDF World");
  expect(result.content).not.toMatch(/[\x00-\x08\x0e-\x1f]/);
  expect(vi.mocked(getDocumentProxy)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(extractText)).toHaveBeenCalledTimes(1);
});
```

Replace the **corrupt PDF** test (`extract.test.ts:215-243`) with:

```ts
it("returns error for corrupt PDF without binary garbage", async () => {
  const corruptPdf = Buffer.from("not-a-real-pdf-just-garbage-data");

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/pdf",
      "content-length": String(corruptPdf.length),
    }),
    arrayBuffer: async () =>
      corruptPdf.buffer.slice(corruptPdf.byteOffset, corruptPdf.byteOffset + corruptPdf.byteLength),
    text: async () => corruptPdf.toString("binary"),
  });

  // Mock Jina fallback failure so the recoverable PDF error surfaces.
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 500,
    headers: new Headers({}),
    text: async () => "",
  });

  vi.mocked(extractText).mockRejectedValueOnce(new Error("Invalid PDF structure"));

  const result = await extractContent("https://example.com/corrupt.pdf");
  expect(result.url).toBe("https://example.com/corrupt.pdf");
  expect(result.error).toBeTruthy();
  expect(result.error).toContain("PDF");
  expect(result.content).toBe("");
});
```

Replace the **oversized PDF** test (`extract.test.ts:245-259`) — size guard runs before library; assert `extractText` not called:

```ts
it("rejects PDF that exceeds MAX_SIZE", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/pdf",
      "content-length": String(10 * 1024 * 1024),
    }),
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => "",
  });

  const result = await extractContent("https://example.com/huge.pdf");
  expect(result.error).toBe("Response too large");
  expect(vi.mocked(extractText)).not.toHaveBeenCalled();
});
```

Reset unpdf mocks in `beforeEach`:

```ts
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  vi.mocked(extractText).mockReset();
  vi.mocked(getDocumentProxy).mockReset();
  vi.mocked(getDocumentProxy).mockImplementation(async (buf: Uint8Array) => ({
    __mockPdf: true,
    byteLength: buf.byteLength,
  }) as unknown as Awaited<ReturnType<typeof getDocumentProxy>>);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`

Expected: FAIL — `AssertionError: expected "spy" to be called 1 times, but got 0 times` for `"extracts text from PDF content-type"` (because `extract.ts` still imports `pdf-parse`, so `vi.mocked(getDocumentProxy)` is never invoked).

**Step 3 — Write minimal implementation**

In `extract.ts`, replace line 5:

```ts
import { extractText, getDocumentProxy } from "unpdf";
```

(Remove `import { PDFParse } from "pdf-parse";`.)

Replace the PDF block (current `extract.ts:109-136`) with:

```ts
  // PDF: extract text via unpdf (Mozilla pdf.js, serverless build, no init-time file reads)
  if (isPdf(contentType)) {
    try {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > MAX_SIZE) {
        return makeErrorResult(url, "Response too large");
      }

      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text: extracted } = await extractText(pdf, { mergePages: true });
      const text = (typeof extracted === "string" ? extracted : extracted.join("\n")).trim();

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

Notes preserved across the swap:
- `Failed to extract text from PDF: ${msg}` wrapper preserves the `result.error.toContain("PDF")` assertion.
- `"Failed to extract text from PDF: no readable text found"` empty-content branch unchanged.
- Pre-library size guards unchanged.
- `parser?.destroy()` finally block removed — unpdf has no destroy lifecycle.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`

Expected: PASS — all 17 `extract.test.ts` tests green.

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all 26 tests passing.

### Task 3: Remove pdf-parse from dependencies and lockfile [depends: 2]

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `dependencies.test.ts`

**Step 1 — Write the failing test**

Create `dependencies.test.ts` at the repo root (same directory as `extract.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "package.json"), "utf-8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("package.json dependency hygiene", () => {
  it("does not depend on the unmaintained pdf-parse package", () => {
    expect(pkg.dependencies?.["pdf-parse"]).toBeUndefined();
    expect(pkg.devDependencies?.["pdf-parse"]).toBeUndefined();
  });

  it("declares unpdf as a runtime dependency", () => {
    expect(pkg.dependencies?.["unpdf"]).toBeDefined();
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run dependencies.test.ts`

Expected: FAIL — `AssertionError: expected '^2.4.5' to be undefined` on the first assertion (because `package.json` still has `"pdf-parse": "^2.4.5"`).

**Step 3 — Write minimal implementation**

Run from the repo root:

```
npm uninstall pdf-parse
```

Removes `"pdf-parse"` from `package.json` `dependencies` and the `node_modules/pdf-parse` entry from `package-lock.json`.

Manually verify:
- `package.json` `dependencies` no longer contains `"pdf-parse"`.
- `package-lock.json` has no `"node_modules/pdf-parse"` entry.
- `unpdf` is still present in `dependencies` (added by Task 1).

**Step 4 — Run test, verify it passes**

Run: `npx vitest run dependencies.test.ts`

Expected: PASS — both `pdf-parse` is gone and `unpdf` is declared.

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all 28 tests passing (26 prior + 2 new dependency-hygiene tests).

Also run: `npm ls pdf-parse`

Expected: `(empty)` or exit code 1 with no `pdf-parse` in the tree.

### Task 4: Update README.md to reference unpdf [no-test] [depends: 3]

**Justification:** Documentation-only edit. No observable runtime behavior.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**

Use `grep` to confirm wording, then `edit` to replace.

Current (`README.md:283`):

```
PDF text is extracted with `pdf-parse`. Corrupt, encrypted, empty, or oversized PDFs return a clear error.
```

Replace with:

```
PDF text is extracted with [`unpdf`](https://github.com/unjs/unpdf) (a serverless build of Mozilla `pdf.js`). Corrupt, encrypted, empty, or oversized PDFs return a clear error.
```

If any other `pdf-parse` mentions exist via `grep -n "pdf-parse" README.md`, replace them with `unpdf` in the same edit.

**Step 2 — Verify**

Run: `grep -n "pdf-parse" README.md`

Expected: no matches.

Run: `grep -n "unpdf" README.md`

Expected: at least one match.

### Task 5: Record install footprint and verify no init-time fixture reads [no-test] [depends: 3]

**Justification:** Verification/evidence task for acceptance criteria #5 (install size goes down) and #4 (no init-time fixture reads). Evidence belongs to the plan artifact, not the production source tree.

**Files:**
- Create: `.megapowers/plans/035-replace-unmaintained-pdf-parse-with-unpd/install-footprint.md`

**Step 1 — Make the change**

Run the four commands and capture output verbatim into the new file under the headings listed below.

```
npm pack --dry-run 2>&1 | tail -20
```

Captures unpacked tarball size of project.

```
du -sh node_modules/unpdf
```

Captures installed footprint of new library.

```
node --input-type=module -e "import('unpdf').then(m => console.log('imported keys:', Object.keys(m).sort().join(', '))).catch(e => { console.error('IMPORT FAILED', e); process.exit(1); })"
```

Confirms `unpdf` imports cleanly with no `ENOENT`/fixture-read failures.

```
grep -RIn "test/data" node_modules/unpdf || echo "no fixture refs"
```

Confirms no `test/data` runtime references.

Write outputs into `install-footprint.md` under headings:
- `## npm pack --dry-run`
- `## node_modules/unpdf size`
- `## unpdf import smoke test`
- `## fixture-read scan`

End with: "Acceptance criteria #4 (no init-time fixture reads) and #5 (install footprint recorded) satisfied."

**Step 2 — Verify**

Run: `cat .megapowers/plans/035-replace-unmaintained-pdf-parse-with-unpd/install-footprint.md`

Expected: all four sections present and populated; import smoke prints a non-empty `imported keys:` containing at least `extractText` and `getDocumentProxy`; fixture-read scan prints `no fixture refs` or reviewed-and-confirmed-benign matches.
