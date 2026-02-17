import { describe, it, expect } from "vitest";

function formatWebSearchOutput(
  results: Array<{ query: string; answer: string; error: string | null }>,
  searchId: string
): string {
  const textParts: string[] = [];
  for (const r of results) {
    textParts.push(`## Query: ${r.query}`);
    if (r.error) {
      textParts.push(`Error: ${r.error}`);
    } else {
      textParts.push(r.answer);
    }
    textParts.push("");
  }
  textParts.push(
    `Use get_search_content with responseId "${searchId}" and query/queryIndex to retrieve full content.`
  );
  return textParts.join("\n");
}

describe("web_search output formatting", () => {
  it("includes responseId in text output", () => {
    const results = [
      { query: "test query", answer: "some answer", error: null },
    ];
    const output = formatWebSearchOutput(results, "abc123");
    expect(output).toContain("abc123");
    expect(output).toContain("get_search_content");
    expect(output).toContain("responseId");
  });

  it("includes responseId even when all queries error", () => {
    const results = [{ query: "bad query", answer: "", error: "API error" }];
    const output = formatWebSearchOutput(results, "xyz789");
    expect(output).toContain("xyz789");
    expect(output).toContain("get_search_content");
    expect(output).toContain("responseId");
  });
});
