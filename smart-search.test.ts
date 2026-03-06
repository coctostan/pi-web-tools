import { describe, expect, it } from "vitest";
import type { ExaSearchResult } from "./exa-search.js";
import { enhanceQuery, postProcessResults } from "./smart-search.js";

describe("enhanceQuery", () => {
  it("marks error-like queries for keyword search without changing the query text", () => {
    const original = "TypeError: Cannot read properties of undefined (reading 'map')";
    const result = enhanceQuery(original);

    expect(result.originalQuery).toBe(original);
    expect(result.finalQuery).toBe(original);
    expect(result.queryChanged).toBe(false);
    expect(result.typeOverride).toBe("keyword");
    expect(result.appliedRules).toContain("error-like");
  });

  it("preserves an explicit version string when expanding a vague coding query", () => {
    const result = enhanceQuery("react v19.2 hooks");

    expect(result.finalQuery).toBe("react v19.2 hooks docs example");
    expect(result.finalQuery).toContain("v19.2");
  });

  it("does not invent a version string when the query has no explicit version", () => {
    const result = enhanceQuery("vite config");

    expect(result.finalQuery).not.toMatch(/\bv?\d+(?:\.\d+){0,2}\b/);
  });

  it("expands a vague 1-3 word coding query", () => {
    const result = enhanceQuery("vite config");

    expect(result.queryChanged).toBe(true);
    expect(result.finalQuery).toBe("vite config docs example");
    expect(result.appliedRules).toContain("vague-coding-query");
  });

  it("does not expand a query that is already specific", () => {
    const original = "how to configure vite alias in tsconfig";
    const result = enhanceQuery(original);

    expect(result.queryChanged).toBe(false);
    expect(result.finalQuery).toBe(original);
    expect(result.appliedRules).toEqual([]);
  });

  it("does not expand a short query that is not coding related", () => {
    const original = "weather today";
    const result = enhanceQuery(original);

    expect(result.queryChanged).toBe(false);
    expect(result.finalQuery).toBe(original);
    expect(result.appliedRules).toEqual([]);
  });

  it("does not force keyword search for generic title-cased queries that merely mention Error", () => {
    const original = "React Error Boundary docs";
    const result = enhanceQuery(original);

    expect(result.typeOverride).toBeUndefined();
    expect(result.finalQuery).toBe(original);
    expect(result.queryChanged).toBe(false);
    expect(result.appliedRules).toEqual([]);
  });
});

describe("postProcessResults", () => {
  it("removes later duplicate results while preserving the first ranked result", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Official Docs",
        url: "https://example.com/docs/getting-started?utm_source=google",
        snippet: "Primary result",
      },
      {
        title: "Official Docs Duplicate",
        url: "https://example.com/docs/getting-started?utm_medium=cpc",
        snippet: "Duplicate result",
      },
    ];

    const result = postProcessResults(input);

    expect(result.duplicatesRemoved).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Official Docs");
    expect(result.results[0].url).toContain("utm_source=google");
  });
  it("removes high-confidence breadcrumb and last-updated snippet noise", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Docs",
        url: "https://example.com/docs/api",
        snippet: "Docs > API > fetch_content Last updated Jan 15, 2026. Returns the fetched page.",
      },
    ];

    const result = postProcessResults(input);
    expect(result.results[0].snippet).toBe("Returns the fetched page.");
  });
  it("keeps malformed URLs and normal snippets instead of failing the whole batch", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Broken URL",
        url: "not a valid url",
        snippet: "Normal snippet text.",
      },
      {
        title: "Canonical",
        url: "https://example.com/reference",
        snippet: "Reference docs.",
      },
      {
        title: "Canonical Duplicate",
        url: "https://example.com/reference?utm_campaign=spring",
        snippet: "Reference docs duplicate.",
      },
    ];

    const result = postProcessResults(input);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].url).toBe("not a valid url");
    expect(result.results[0].snippet).toBe("Normal snippet text.");
    expect(result.results[1].title).toBe("Canonical");
    expect(result.duplicatesRemoved).toBe(1);
  });
  it("skips malformed result entries and continues processing later results", () => {
    const input = [
      {
        title: "Broken entry",
        url: 42 as any,
        snippet: undefined as any,
      },
      {
        title: "Canonical",
        url: "https://example.com/reference",
        snippet: "Reference docs.",
      },
      {
        title: "Canonical Duplicate",
        url: "https://example.com/reference?utm_campaign=spring",
        snippet: "Reference docs duplicate.",
      },
    ] as unknown as ExaSearchResult[];

    const result = postProcessResults(input);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      title: "Broken entry",
      url: "",
      snippet: "",
    });
    expect(result.results[1].title).toBe("Canonical");
    expect(result.duplicatesRemoved).toBe(1);
  });
});
