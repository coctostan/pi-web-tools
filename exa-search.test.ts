import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchExa, findSimilarExa, formatSearchResults, type ExaSearchResult } from "./exa-search.js";

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

    it("does not truncate summary snippet even when over 200 chars", () => {
      const summary = "S".repeat(260);
      const results: ExaSearchResult[] = [
        { title: "Summary Page", url: "https://example.com/page", snippet: summary },
      ];

      const output = formatSearchResults(results);
      expect(output).toContain(summary);
      expect(output).not.toContain("…");
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
      expect(body.contents).toEqual({ summary: true });
    });

    it("sends contents.summary when detail is 'summary'", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test query", { apiKey: "key", detail: "summary" });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.contents).toEqual({ summary: true });
    });

    it("defaults to summary mode when detail is omitted", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test query", { apiKey: "key" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.contents).toEqual({ summary: true });
    });

    it("handles API errors with status code in message", async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 429,
          text: async () => "Rate limit exceeded. Please try again later.",
        });
        const promise = expect(
          searchExa("test query", { apiKey: "test-key" })
        ).rejects.toThrow("429");
        await vi.advanceTimersByTimeAsync(3000); // exhaust 2 retries (1s + 2s backoff)
        await promise;
      } finally {
        vi.useRealTimers();
      }
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

    it("includes maxAgeHours in request body when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", { apiKey: "key", maxAgeHours: 24 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.maxAgeHours).toBe(24);
    });

    it("omits maxAgeHours from request body when not provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", { apiKey: "key" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.maxAgeHours).toBeUndefined();
    });

    it("uses highlights content mode with numSentences 3 and highlightsPerUrl 3", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await searchExa("test", { apiKey: "key", detail: "highlights" });

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

    it("maps snippet fallback order summary -> highlights -> text -> empty string", async () => {
      // summary case
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Summary Result",
              url: "https://example.com/summary",
              summary: "A concise one-line summary of the page.",
            },
          ],
        }),
      });
      let results = await searchExa("test", { apiKey: "key" });
      expect(results).toHaveLength(1);
      expect(results[0].snippet).toBe("A concise one-line summary of the page.");

      // highlights fallback case
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Highlights Result",
              url: "https://example.com/highlights",
              highlights: ["Sentence one.", "Sentence two."],
            },
          ],
        }),
      });
      results = await searchExa("test", { apiKey: "key", detail: "highlights" });
      expect(results[0].snippet).toBe("Sentence one. Sentence two.");

      // text fallback case
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Text Result",
              url: "https://example.com/text",
              text: "Raw text fallback",
            },
          ],
        }),
      });
      results = await searchExa("test", { apiKey: "key" });
      expect(results[0].snippet).toBe("Raw text fallback");

      // empty fallback case (title + url only)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Bare Result",
              url: "https://example.com/bare",
            },
          ],
        }),
      });
      results = await searchExa("test", { apiKey: "key" });
      expect(results[0].snippet).toBe("");
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

  describe("retry integration", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it("retries on 429 and succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ title: "Result", url: "https://example.com", summary: "A result" }],
          }),
        });

      const promise = searchExa("test query", { apiKey: "test-key" });
      await vi.advanceTimersByTimeAsync(1000);
      const results = await promise;
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Result");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    it("retries on 503 and succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "service unavailable" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ title: "Result", url: "https://example.com", summary: "A result" }],
          }),
        });

      const promise = searchExa("test query", { apiKey: "test-key" });
      await vi.advanceTimersByTimeAsync(1000);
      const results = await promise;
      expect(results).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("findSimilarExa", () => {
    it("sends POST to /findSimilar endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await findSimilarExa("https://example.com", { apiKey: "key" });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.exa.ai/findSimilar");
      expect(init.method).toBe("POST");
    });

    it("request body includes url field (not query)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await findSimilarExa("https://example.com", { apiKey: "key" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe("https://example.com");
      expect(body.query).toBeUndefined();
    });

    it("returns ExaSearchResult[] with title, url, snippet", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Similar Page",
              url: "https://similar.com",
              summary: "A similar page.",
              publishedDate: "2025-03-01",
            },
          ],
        }),
      });

      const results = await findSimilarExa("https://example.com", { apiKey: "key" });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        title: "Similar Page",
        url: "https://similar.com",
        snippet: "A similar page.",
        publishedDate: "2025-03-01",
      });
    });
  });

  describe("findSimilarExa — BUG #019: filters silently dropped", () => {
    it("findSimilarExa does NOT forward maxAgeHours to /findSimilar (endpoint does not support it)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await findSimilarExa("https://example.com", { apiKey: "key", maxAgeHours: 24 });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // maxAgeHours is a ContentsRequest field (livecrawl control), not a CommonRequest filter.
      // /findSimilar uses CommonRequest — maxAgeHours must NOT appear in the request body.
      expect(body.maxAgeHours).toBeUndefined();
    });

    it("BUG #019: sends includeDomains in request body when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await findSimilarExa("https://example.com", { apiKey: "key", includeDomains: ["github.com"] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Currently includeDomains is silently dropped — this assertion will FAIL until fixed
      expect(body.includeDomains).toEqual(["github.com"]);
    });

    it("BUG #019: sends excludeDomains in request body when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await findSimilarExa("https://example.com", { apiKey: "key", excludeDomains: ["pinterest.com"] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Currently excludeDomains is silently dropped — this assertion will FAIL until fixed
      expect(body.excludeDomains).toEqual(["pinterest.com"]);
    });

    it("findSimilarExa does NOT forward category to /findSimilar (endpoint does not support it)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await findSimilarExa("https://example.com", { apiKey: "key", category: "news" });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // category is a search-specific field, not in CommonRequest.
      // /findSimilar uses CommonRequest — category must NOT appear in the request body.
      expect(body.category).toBeUndefined();
  });
  });
  describe("findSimilarExa error paths", () => {
    it("throws when apiKey is null", async () => {
      await expect(findSimilarExa("https://example.com", { apiKey: null })).rejects.toThrow("EXA_API_KEY");
      await expect(findSimilarExa("https://example.com", { apiKey: null })).rejects.toThrow("web-tools.json");
    });

    it("throws when fetch fails with a network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));
      await expect(findSimilarExa("https://example.com", { apiKey: "key" })).rejects.toThrow(
        `Exa findSimilar request failed for url "https://example.com": Network failure`
      );
    });

    it("throws on non-ok HTTP response with status code", async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        });
        const promise = expect(
          findSimilarExa("https://example.com", { apiKey: "key" })
        ).rejects.toThrow("401");
        await vi.advanceTimersByTimeAsync(3000);
        await promise;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
