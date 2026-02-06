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
