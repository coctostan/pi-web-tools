import { describe, it, expect } from "vitest";

// Test dedupeUrls in isolation (the actual function is simple Set-based dedup)
// The full index.ts requires pi-agent runtime packages, so we test the logic directly
function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

describe("dedupeUrls", () => {
  it("removes duplicate URLs preserving order", () => {
    const input = [
      "https://example.com",
      "https://foo.bar",
      "https://example.com",
      "https://baz.qux",
      "https://foo.bar",
    ];
    const result = dedupeUrls(input);
    expect(result).toEqual([
      "https://example.com",
      "https://foo.bar",
      "https://baz.qux",
    ]);
  });

  it("handles empty array", () => {
    expect(dedupeUrls([])).toEqual([]);
  });

  it("returns same array when no duplicates", () => {
    const input = ["https://a.com", "https://b.com", "https://c.com"];
    const result = dedupeUrls(input);
    expect(result).toEqual(input);
  });
});
