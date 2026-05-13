import { describe, it, expect } from "vitest";
import { normalizeWebSearchInput, normalizeFetchContentInput, normalizeCodeSearchInput, normalizeGetSearchContentInput, dedupeUrls } from "./tool-params.js";

describe("tool-params", () => {
  it("dedupeUrls preserves order", () => {
    expect(dedupeUrls(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("normalizeWebSearchInput requires query or queries", () => {
    expect(() => normalizeWebSearchInput({})).toThrow(/Either 'query' or 'queries'/);
  });

  it("normalizeWebSearchInput accepts single query", () => {
    expect(normalizeWebSearchInput({ query: "x" }).queries).toEqual(["x"]);
  });

  it("normalizeWebSearchInput passes through type when valid", () => {
    const result = normalizeWebSearchInput({ query: "x", type: "deep" });
    expect(result.type).toBe("deep");
  });

  it("normalizeWebSearchInput defaults type to undefined", () => {
    const result = normalizeWebSearchInput({ query: "x" });
    expect(result.type).toBeUndefined();
  });

  it("normalizeWebSearchInput ignores invalid type", () => {
    const result = normalizeWebSearchInput({ query: "x", type: "invalid" });
    expect(result.type).toBeUndefined();
  });

  it("normalizeWebSearchInput passes through category when valid", () => {
    const result = normalizeWebSearchInput({ query: "x", category: "news" });
    expect(result.category).toBe("news");
  });

  it("normalizeWebSearchInput defaults category to undefined", () => {
    const result = normalizeWebSearchInput({ query: "x" });
    expect(result.category).toBeUndefined();
  });

  it("normalizeWebSearchInput ignores invalid category", () => {
    const result = normalizeWebSearchInput({ query: "x", category: 123 });
    expect(result.category).toBeUndefined();
  });

  it("normalizeWebSearchInput ignores invalid string category", () => {
    const result = normalizeWebSearchInput({ query: "x", category: "not-a-real-category" });
    expect(result.category).toBeUndefined();
  });

  it("normalizeWebSearchInput passes through includeDomains array", () => {
    const result = normalizeWebSearchInput({ query: "x", includeDomains: ["github.com"] });
    expect(result.includeDomains).toEqual(["github.com"]);
  });

  it("normalizeWebSearchInput filters non-string entries from domain arrays", () => {
    const result = normalizeWebSearchInput({ query: "x", includeDomains: ["a.com", 123, null] });
    expect(result.includeDomains).toEqual(["a.com"]);
  });

  it("normalizeWebSearchInput passes through excludeDomains array", () => {
    const result = normalizeWebSearchInput({ query: "x", excludeDomains: ["pinterest.com"] });
    expect(result.excludeDomains).toEqual(["pinterest.com"]);
  });

  it("normalizeWebSearchInput filters non-string entries from excludeDomains", () => {
    const result = normalizeWebSearchInput({ query: "x", excludeDomains: ["b.com", 42, null] });
    expect(result.excludeDomains).toEqual(["b.com"]);
  });

  it("normalizeWebSearchInput defaults detail to undefined when omitted", () => {
    const result = normalizeWebSearchInput({ query: "x" });
    expect(result.detail).toBeUndefined();
  });

  it("normalizeWebSearchInput passes through 'summary'", () => {
    const result = normalizeWebSearchInput({ query: "x", detail: "summary" });
    expect(result.detail).toBe("summary");
  });

  it("normalizeWebSearchInput passes through 'highlights'", () => {
    const result = normalizeWebSearchInput({ query: "x", detail: "highlights" });
    expect(result.detail).toBe("highlights");
  });

  it("normalizeWebSearchInput returns undefined for invalid detail values", () => {
    expect(normalizeWebSearchInput({ query: "x", detail: "full" }).detail).toBeUndefined();
    expect(normalizeWebSearchInput({ query: "x", detail: 42 }).detail).toBeUndefined();
    expect(normalizeWebSearchInput({ query: "x", detail: "" }).detail).toBeUndefined();
  });

  it("normalizeWebSearchInput preserves canonical freshness without maxAgeHours", () => {
    expect(normalizeWebSearchInput({ query: "x", freshness: "realtime" }).freshness).toBe("realtime");
    expect(normalizeWebSearchInput({ query: "x", freshness: "day" }).freshness).toBe("day");
    expect(normalizeWebSearchInput({ query: "x", freshness: "week" }).freshness).toBe("week");
    expect(normalizeWebSearchInput({ query: "x", freshness: "any" }).freshness).toBe("any");
    expect(normalizeWebSearchInput({ query: "x", freshness: "invalid" }).freshness).toBeUndefined();
    expect(normalizeWebSearchInput({ query: "x" }).freshness).toBeUndefined();
    expect(normalizeWebSearchInput({ query: "x", freshness: "day" })).not.toHaveProperty("maxAgeHours");
  });

  it("normalizeWebSearchInput accepts similarUrl without query", () => {
    const result = normalizeWebSearchInput({ similarUrl: "https://example.com" });
    expect(result.similarUrl).toBe("https://example.com");
    expect(result.queries).toEqual([]);
  });

  it("normalizeWebSearchInput throws when both query and similarUrl are provided", () => {
    expect(() => normalizeWebSearchInput({ query: "foo", similarUrl: "https://example.com" })).toThrow(/mutually exclusive/i);
  });

  it("normalizeWebSearchInput still throws when neither query nor similarUrl provided", () => {
    expect(() => normalizeWebSearchInput({})).toThrow(/Either 'query' or 'queries'/i);
  });

  it("normalizeCodeSearchInput requires query", () => {
    expect(() => normalizeCodeSearchInput({})).toThrow(/'query' must be provided/);
  });

  it("normalizeCodeSearchInput accepts query string", () => {
    const result = normalizeCodeSearchInput({ query: "react hooks" });
    expect(result.query).toBe("react hooks");
    expect(result.tokensNum).toBeUndefined();
  });

  it("normalizeCodeSearchInput passes through valid tokensNum", () => {
    const result = normalizeCodeSearchInput({ query: "x", tokensNum: 5000 });
    expect(result.tokensNum).toBe(5000);
  });

  it("normalizeCodeSearchInput clamps tokensNum to valid range", () => {
    expect(normalizeCodeSearchInput({ query: "x", tokensNum: 10 }).tokensNum).toBe(50);
    expect(normalizeCodeSearchInput({ query: "x", tokensNum: 200000 }).tokensNum).toBe(100000);
  });

  it("normalizeCodeSearchInput ignores non-number tokensNum", () => {
    const result = normalizeCodeSearchInput({ query: "x", tokensNum: "big" });
    expect(result.tokensNum).toBeUndefined();
  });

  it("normalizeFetchContentInput accepts urls array and dedupes", () => {
    expect(normalizeFetchContentInput({ urls: ["u1", "u1", "u2"] }).urls).toEqual(["u1", "u2"]);
  });

  it("extracts prompt string when provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      prompt: "What is the API rate limit?",
    });
    expect(result.prompt).toBe("What is the API rate limit?");
  });

  it("defaults prompt to undefined when not provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
    });
    expect(result.prompt).toBeUndefined();
  });

  it("normalizeFetchContentInput extracts noCache boolean when provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      noCache: true,
    });
    expect(result.noCache).toBe(true);
  });

  it("normalizeFetchContentInput defaults noCache to undefined when not provided", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
    });
    expect(result.noCache).toBeUndefined();
  });

  it("normalizeFetchContentInput ignores non-boolean noCache", () => {
    const result = normalizeFetchContentInput({
      url: "https://example.com",
      noCache: "yes",
    });
    expect(result.noCache).toBeUndefined();
  });


  it("normalizeWebSearchInput defaults and clamps numResults for prepareArguments (AC-PREPARE-4)", () => {
    expect(normalizeWebSearchInput({ query: "q" }).numResults).toBe(5);
    expect(normalizeWebSearchInput({ query: "q", numResults: 0 }).numResults).toBe(1);
    expect(normalizeWebSearchInput({ query: "q", numResults: -5 }).numResults).toBe(1);
    expect(normalizeWebSearchInput({ query: "q", numResults: 100 }).numResults).toBe(20);
    expect(normalizeWebSearchInput({ query: "q", numResults: 7.6 }).numResults).toBe(8);
  });

  it("normalize prepare functions produce the post-prepare shapes consumed by execute (AC-PREPARE-3)", () => {
    expect(normalizeWebSearchInput({ query: "q" }).queries).toEqual(["q"]);
    expect(normalizeFetchContentInput({ url: "https://a" }).urls).toEqual(["https://a"]);
    expect(normalizeFetchContentInput({ urls: ["u1", "u1", "u2"] }).urls).toEqual(["u1", "u2"]);
    expect(normalizeCodeSearchInput({ query: "useState" })).toEqual({ query: "useState", tokensNum: undefined });
    expect(normalizeGetSearchContentInput({ responseId: "r1" })).toEqual({ responseId: "r1", query: undefined, queryIndex: undefined, url: undefined, urlIndex: undefined, maxChars: undefined });
  });

  it("normalizeWebSearchInput preserves canonical freshness and documented validation errors (AC-PREPARE-6)", () => {
    expect(normalizeWebSearchInput({ query: "q", freshness: "day" }).freshness).toBe("day");
    expect(() => normalizeWebSearchInput({ query: "q", similarUrl: "https://x" })).toThrow("'similarUrl' and 'query'/'queries' are mutually exclusive.");
    expect(() => normalizeWebSearchInput({})).toThrow("Either 'query' or 'queries' must be provided.");
    expect(() => normalizeFetchContentInput({})).toThrow("Either 'url' or 'urls' must be provided.");
    expect(() => normalizeCodeSearchInput({})).toThrow("'query' must be provided.");
    expect(() => normalizeGetSearchContentInput({})).toThrow("'responseId' must be provided.");
  });
});
