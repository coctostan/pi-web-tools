---
id: 2
title: Swap extract.ts PDF branch to unpdf and re-mock PDF tests
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - extract.ts
  - extract.test.ts
files_to_create: []
---

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

Replace the **oversized PDF** test (`extract.test.ts:245-259`) with the same body it already has — the size guard runs before any library call, so it stays library-agnostic. No edit required to its assertions; just make sure `vi.mocked(extractText)` is **not** called:

```ts
it("rejects PDF that exceeds MAX_SIZE", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/pdf",
      "content-length": String(10 * 1024 * 1024), // 10MB, over 5MB limit
    }),
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => "",
  });

  const result = await extractContent("https://example.com/huge.pdf");
  expect(result.error).toBe("Response too large");
  expect(vi.mocked(extractText)).not.toHaveBeenCalled();
});
```

Also reset the unpdf mocks in `beforeEach` next to the existing `mockFetch.mockReset()`:

```ts
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  vi.mocked(extractText).mockReset();
  vi.mocked(getDocumentProxy).mockReset();
  // Re-install default getDocumentProxy shim that just echoes the buffer.
  vi.mocked(getDocumentProxy).mockImplementation(async (buf: Uint8Array) => ({
    __mockPdf: true,
    byteLength: buf.byteLength,
  }) as unknown as Awaited<ReturnType<typeof getDocumentProxy>>);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`

Expected: FAIL. Concretely:
- `"extracts text from PDF content-type"` → `AssertionError: expected "spy" to be called 1 times, but got 0 times` (because `extract.ts` still imports `pdf-parse`, so `vi.mocked(getDocumentProxy)` is never invoked).
- `"returns error for corrupt PDF without binary garbage"` → may incidentally pass (pdf-parse will reject the garbage buffer with its own error), but at minimum the first PDF test fails, which fails the suite.

If the runner emits a different error string, paste that exact text into this step before continuing.

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
- Pre-library size guards (`content-length` and post-arrayBuffer) unchanged.
- `parser?.destroy()` finally block removed — unpdf has no destroy lifecycle.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`

Expected: PASS — all 17 `extract.test.ts` tests green.

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all 26 tests passing.
