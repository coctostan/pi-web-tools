import { describe, it, expect } from "vitest";
import {
  truncateContent,
  DEFAULT_GET_CONTENT_MAX_CHARS,
  MAX_GET_CONTENT_CHARS,
} from "./truncation.js";

describe("truncateContent", () => {
  it("does not truncate content under default limit", () => {
    const content = "a".repeat(1000);
    const result = truncateContent(content);
    expect(result).toBe(content);
  });

  it("truncates content at default 30K limit when no maxChars given", () => {
    const content = "a".repeat(50_000);
    const result = truncateContent(content);
    expect(result.length).toBeLessThan(content.length);
    expect(result).toContain("[Content truncated at");
    expect(result).toContain("Total: 50000 chars");
  });

  it("truncates at explicit maxChars value", () => {
    const content = "a".repeat(60_000);
    const result = truncateContent(content, 50_000);
    expect(result.length).toBeLessThanOrEqual(50_000 + 200);
    expect(result).toContain("[Content truncated at 50000 chars");
  });

  it("caps maxChars at hard ceiling of 100K", () => {
    const content = "a".repeat(200_000);
    const result = truncateContent(content, 999_999);
    expect(result).toContain(`[Content truncated at ${MAX_GET_CONTENT_CHARS} chars`);
  });

  it("does not truncate when content is under explicit maxChars", () => {
    const content = "a".repeat(5_000);
    const result = truncateContent(content, 10_000);
    expect(result).toBe(content);
  });

  it("includes total size in truncation message", () => {
    const content = "a".repeat(40_000);
    const result = truncateContent(content, 10_000);
    expect(result).toContain("Total: 40000 chars");
    expect(result).toContain("Use a higher maxChars to retrieve more.");
  });

  it("exports expected constants", () => {
    expect(DEFAULT_GET_CONTENT_MAX_CHARS).toBe(30_000);
    expect(MAX_GET_CONTENT_CHARS).toBe(100_000);
  });
});
