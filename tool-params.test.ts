import { describe, it, expect } from "vitest";
import { normalizeWebSearchInput, normalizeFetchContentInput, normalizeCodeSearchInput, dedupeUrls } from "./tool-params.js";

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

  it("normalizeWebSearchInput maps freshness 'realtime' to maxAgeHours 0", () => {
    const result = normalizeWebSearchInput({ query: "x", freshness: "realtime" });
    expect(result.maxAgeHours).toBe(0);
  });

  it("normalizeWebSearchInput maps freshness 'day' to maxAgeHours 24", () => {
    const result = normalizeWebSearchInput({ query: "x", freshness: "day" });
    expect(result.maxAgeHours).toBe(24);
  });

  it("normalizeWebSearchInput maps freshness 'week' to maxAgeHours 168", () => {
    const result = normalizeWebSearchInput({ query: "x", freshness: "week" });
    expect(result.maxAgeHours).toBe(168);
  });

  it("normalizeWebSearchInput maps freshness 'any' to no maxAgeHours", () => {
    const result = normalizeWebSearchInput({ query: "x", freshness: "any" });
    expect(result.maxAgeHours).toBeUndefined();
  });

  it("normalizeWebSearchInput omits maxAgeHours when freshness not provided", () => {
    const result = normalizeWebSearchInput({ query: "x" });
    expect(result.maxAgeHours).toBeUndefined();
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
});
