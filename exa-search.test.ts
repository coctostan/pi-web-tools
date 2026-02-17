import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchExa, formatSearchResults, type ExaSearchResult } from "./exa-search.js";

describe("exa-search", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("formatSearchResults", () => {
    it("handles empty results", () => {
      const result = formatSearchResults([]);
      expect(result).toBe("No results found.");
    });

    it("formats results with title/url/snippet", () => {
      const results: ExaSearchResult[] = [
        {
          title: "Test Title",
          url: "https://example.com",
          snippet: "This is a test snippet.",
          publishedDate: "2025-01-15",
        },
        {
          title: "Another Result",
          url: "https://example.org",
          snippet: "Another snippet without a date.",
        },
      ];

      const output = formatSearchResults(results);

      // Should be a numbered list
      expect(output).toContain("1.");
      expect(output).toContain("2.");
      // Should contain bold titles
      expect(output).toContain("**Test Title**");
      expect(output).toContain("**Another Result**");
      // Should contain URLs
      expect(output).toContain("https://example.com");
      expect(output).toContain("https://example.org");
      // Should contain snippets
      expect(output).toContain("This is a test snippet.");
      expect(output).toContain("Another snippet without a date.");
      // Should include date for first result
      expect(output).toContain("2025-01-15");
    });
  });

  describe("searchExa", () => {
    it("throws when apiKey is null", async () => {
      await expect(searchExa("test query", { apiKey: null })).rejects.toThrow("EXA_API_KEY");
      // Error should also mention config file
      await expect(searchExa("test query", { apiKey: null })).rejects.toThrow("web-tools.json");
    });

    it("sends correct request to Exa API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test query", { apiKey: "test-key-123" });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.exa.ai/search");
      expect(init.method).toBe("POST");
      expect(init.headers["x-api-key"]).toBe("test-key-123");
      expect(init.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(init.body);
      expect(body.query).toBe("test query");
      expect(body.numResults).toBe(5); // default
      expect(body.contents).toEqual({ highlights: { numSentences: 3, highlightsPerUrl: 3 } });
    });

    it("handles API errors with status code in message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded. Please try again later.",
      });

      await expect(
        searchExa("test query", { apiKey: "test-key" })
      ).rejects.toThrow("429");
    });

    it("respects numResults parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test query", { apiKey: "test-key", numResults: 10 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.numResults).toBe(10);
    });

    it("maps response results to ExaSearchResult", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Result One",
              url: "https://example.com/one",
              text: "This is the text content of result one.",
              publishedDate: "2025-06-01",
            },
            {
              title: "Result Two",
              url: "https://example.com/two",
              text: "Text content of result two.",
            },
          ],
        }),
      });

      const results = await searchExa("my query", { apiKey: "key" });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: "Result One",
        url: "https://example.com/one",
        snippet: "This is the text content of result one.",
        publishedDate: "2025-06-01",
      });
      expect(results[1]).toEqual({
        title: "Result Two",
        url: "https://example.com/two",
        snippet: "Text content of result two.",
        publishedDate: undefined,
      });
    });

    it("sends type parameter when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", { apiKey: "key", type: "deep" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe("deep");
    });

    it("maps type 'auto' to omitting type from body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", { apiKey: "key", type: "auto" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBeUndefined();
    });

    it("passes through instant and deep type values", async () => {
      // "instant" -> instant
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
      await searchExa("test", { apiKey: "key", type: "instant" });
      let body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe("instant");

      // "deep" -> deep
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
      await searchExa("test", { apiKey: "key", type: "deep" });
      body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.type).toBe("deep");
    });

    it("sends category parameter when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", { apiKey: "key", category: "news" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.category).toBe("news");
    });

    it("sends includeDomains and excludeDomains when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", {
        apiKey: "key",
        includeDomains: ["github.com"],
        excludeDomains: ["pinterest.com"],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.includeDomains).toEqual(["github.com"]);
      expect(body.excludeDomains).toEqual(["pinterest.com"]);
    });

    it("uses highlights content mode with numSentences 3 and highlightsPerUrl 3", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", { apiKey: "key" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.contents).toEqual({ highlights: { numSentences: 3, highlightsPerUrl: 3 } });
      expect(body.contents.text).toBeUndefined();
    });

    it("parses highlights response into snippet", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Highlights Result",
              url: "https://example.com",
              highlights: ["First highlight.", "Second highlight."],
              publishedDate: "2025-01-01",
            },
          ],
        }),
      });

      const results = await searchExa("test", { apiKey: "key" });
      expect(results).toHaveLength(1);
      expect(results[0].snippet).toBe("First highlight. Second highlight.");
      expect(results[0].title).toBe("Highlights Result");
    });

    it("falls back to text when highlights array has no valid strings", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Fallback Result",
              url: "https://example.com",
              highlights: [123, null, {}],
              text: "Fallback text content.",
            },
          ],
        }),
      });

      const results = await searchExa("test", { apiKey: "key" });
      expect(results).toHaveLength(1);
      expect(results[0].snippet).toBe("Fallback text content.");
    });

    it("throws a friendly error for malformed Exa responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: "not-an-array" }),
      });

      await expect(searchExa("test query", { apiKey: "key" }))
        .rejects
        .toThrow(/Malformed Exa API response/i);
    });

    it("throws a friendly error when results entries are not objects", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [null] }),
      });

      await expect(searchExa("test query", { apiKey: "key" }))
        .rejects
        .toThrow(/Malformed Exa API response: results\[0\] must be an object/i);
    });

    it("wraps network errors with query context", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ENOTFOUND"));

      await expect(searchExa("hello world", { apiKey: "key" }))
        .rejects
        .toThrow(/Exa request failed.*hello world/i);
    });
  });
});
