import { describe, it, expect } from "vitest";
import { normalizeWebSearchInput, normalizeFetchContentInput, dedupeUrls } from "./tool-params.js";

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

  it("normalizeFetchContentInput accepts urls array and dedupes", () => {
    expect(normalizeFetchContentInput({ urls: ["u1", "u1", "u2"] }).urls).toEqual(["u1", "u2"]);
  });
});
