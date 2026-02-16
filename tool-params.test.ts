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
});
