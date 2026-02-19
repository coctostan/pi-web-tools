import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { extractContent, extractHeadingTitle, fetchAllContent } from "./extract.js";
import type { ExtractedContent } from "./storage.js";

describe("extract", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("extractContent", () => {
    it("returns error for invalid URL", async () => {
      const result = await extractContent("not-a-url");
      expect(result.error).toBe("Invalid URL");
      expect(result.url).toBe("not-a-url");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns error for aborted request", async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await extractContent("https://example.com", controller.signal);
      expect(result.error).toBe("Aborted");
      expect(result.url).toBe("https://example.com");
    });

    it("extracts readable HTML content", async () => {
      const html = `<!DOCTYPE html>
<html><head><title>Test Article</title></head>
<body>
<article>
<h1>Test Article Title</h1>
<p>${"Lorem ipsum dolor sit amet. ".repeat(50)}</p>
<p>${"Consectetur adipiscing elit. ".repeat(50)}</p>
</article>
</body></html>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "text/html; charset=utf-8",
          "content-length": String(html.length),
        }),
        text: async () => html,
      });

      const result = await extractContent("https://example.com/article");
      expect(result.url).toBe("https://example.com/article");
      expect(result.title).toBeTruthy();
      expect(result.content.length).toBeGreaterThan(100);
      expect(result.error).toBeNull();
    });

    it("returns non-HTML content directly", async () => {
      const jsonContent = JSON.stringify({ key: "value", data: [1, 2, 3] });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-length": String(jsonContent.length),
        }),
        text: async () => jsonContent,
      });

      const result = await extractContent("https://api.example.com/data.json");
      expect(result.content).toBe(jsonContent);
      expect(result.error).toBeNull();
    });

    it("returns HTTP error with status code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers({}),
        text: async () => "Not Found",
      });

      // Also mock the Jina fallback
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({}),
        text: async () => "",
      });

      const result = await extractContent("https://example.com/missing");
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("404");
    });

    it("extracts text from PDF content-type", async () => {
  // Mock fetch to return a PDF response with a minimal valid PDF buffer
  const pdfBuffer = Buffer.from(
    "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
    "4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Hello PDF World) Tj ET\nendstream\nendobj\n" +
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
    "xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000360 00000 n \n" +
    "trailer<</Size 6/Root 1 0 R>>\nstartxref\n434\n%%EOF"
  );

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/pdf",
      "content-length": String(pdfBuffer.length),
    }),
    arrayBuffer: async () => pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength),
    text: async () => pdfBuffer.toString("binary"),
  });

  const result = await extractContent("https://example.com/doc.pdf");
  expect(result.url).toBe("https://example.com/doc.pdf");
  expect(result.error).toBeNull();
  expect(result.content).toBeTruthy();
  expect(result.content.length).toBeGreaterThan(0);
  // Should not contain binary garbage
  expect(result.content).not.toMatch(/[\x00-\x08\x0e-\x1f]/);
});

it("returns error for corrupt PDF without binary garbage", async () => {
  const corruptPdf = Buffer.from("not-a-real-pdf-just-garbage-data");

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/pdf",
      "content-length": String(corruptPdf.length),
    }),
    arrayBuffer: async () => corruptPdf.buffer.slice(corruptPdf.byteOffset, corruptPdf.byteOffset + corruptPdf.byteLength),
    text: async () => corruptPdf.toString("binary"),
  });

  // Should also mock Jina fallback failure
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 500,
    headers: new Headers({}),
    text: async () => "",
  });

  const result = await extractContent("https://example.com/corrupt.pdf");
  expect(result.url).toBe("https://example.com/corrupt.pdf");
  expect(result.error).toBeTruthy();
  expect(result.error).toContain("PDF");
  // Must not contain binary garbage
  expect(result.content).toBe("");
});

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
});

    it("rejects unsupported content types", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "image/png",
          "content-length": "1024",
        }),
        text: async () => "",
      });

      const result = await extractContent("https://example.com/image.png");
      expect(result.error).toBe("Unsupported content type");
      // Should NOT try Jina fallback for non-recoverable errors
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to Jina Reader when HTTP extraction is incomplete", async () => {
      const shortHtml = "<!doctype html><html><head><title>X</title></head><body><article><p>hi</p></article></body></html>";
      const goodMd = "# Title\n\n" + "useful content ".repeat(30);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html", "content-length": String(shortHtml.length) }),
          text: async () => shortHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/markdown" }),
          text: async () => `Markdown Content:\n\n${goodMd}`,
        });

      const result = await extractContent("https://example.com/post");

      expect(result.error).toBeNull();
      expect(result.content).toContain("useful content");
      expect(mockFetch.mock.calls[1][0]).toContain("https://r.jina.ai/");
    });
  });

  describe("fetchAllContent", () => {
    it("fetches multiple URLs concurrently", async () => {
      const makeHtml = (title: string) => {
        const body = "Content here. ".repeat(100);
        return `<!DOCTYPE html><html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
      };

      const html1 = makeHtml("Page One");
      const html2 = makeHtml("Page Two");

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html", "content-length": String(html1.length) }),
          text: async () => html1,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html", "content-length": String(html2.length) }),
          text: async () => html2,
        });

      const results = await fetchAllContent([
        "https://example.com/one",
        "https://example.com/two",
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].url).toBe("https://example.com/one");
      expect(results[1].url).toBe("https://example.com/two");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("extractHeadingTitle", () => {
    it("extracts h1 title", () => {
      const text = "# My Great Article\n\nSome content here.";
      expect(extractHeadingTitle(text)).toBe("My Great Article");
    });

    it("extracts h2 title", () => {
      const text = "## Section Heading\n\nMore content.";
      expect(extractHeadingTitle(text)).toBe("Section Heading");
    });

    it("returns null for no heading", () => {
      const text = "Just some plain text without any headings.";
      expect(extractHeadingTitle(text)).toBeNull();
    });
  });
});
