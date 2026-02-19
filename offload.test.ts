import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  shouldOffload,
  offloadToFile,
  buildOffloadResult,
  cleanupTempFiles,
  FILE_OFFLOAD_THRESHOLD,
  PREVIEW_SIZE,
} from "./offload.js";

describe("offload", () => {
  afterEach(() => {
    cleanupTempFiles();
  });

  describe("shouldOffload", () => {
    it("returns false for small content", () => {
      expect(shouldOffload("a".repeat(1000))).toBe(false);
    });

    it("returns true for content over threshold", () => {
      expect(shouldOffload("a".repeat(FILE_OFFLOAD_THRESHOLD + 1))).toBe(true);
    });

    it("returns false for content exactly at threshold", () => {
      expect(shouldOffload("a".repeat(FILE_OFFLOAD_THRESHOLD))).toBe(false);
    });
  });

  describe("offloadToFile", () => {
    it("writes content to a temp file and returns path", () => {
      const content = "a".repeat(FILE_OFFLOAD_THRESHOLD + 100);
      const filePath = offloadToFile(content);
      expect(filePath).toContain("pi-web-");
      expect(filePath).toContain(tmpdir());
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe(content);
    });
  });

  describe("buildOffloadResult", () => {
    it("returns preview with file path and size info", () => {
      const content = "Hello world! ".repeat(5000); // ~65K chars
      const filePath = offloadToFile(content);
      const result = buildOffloadResult(content, filePath);

      expect(result.length).toBeLessThan(content.length);
      expect(result).toContain(filePath);
      expect(result).toContain(String(content.length));
      expect(result).toContain("Full content saved to");
      expect(result).toContain("Use bash to search/filter");
      expect(result).toContain("Hello world!");
    });
  });

  describe("cleanupTempFiles", () => {
    it("removes all tracked temp files", () => {
      const path1 = offloadToFile("content one ".repeat(3000));
      const path2 = offloadToFile("content two ".repeat(3000));
      expect(existsSync(path1)).toBe(true);
      expect(existsSync(path2)).toBe(true);

      cleanupTempFiles();

      expect(existsSync(path1)).toBe(false);
      expect(existsSync(path2)).toBe(false);
    });

    it("handles already-deleted files gracefully", () => {
      const path1 = offloadToFile("x".repeat(100));
      unlinkSync(path1);
      expect(() => cleanupTempFiles()).not.toThrow();
    });
  });

  it("exports expected constants", () => {
    expect(FILE_OFFLOAD_THRESHOLD).toBe(30_000);
    expect(PREVIEW_SIZE).toBe(2_000);
  });
});
