import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "./github-extract.js";

describe("parseGitHubUrl", () => {
  it("parses root repo URL", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      refIsFullSha: false,
      type: "root",
    });
  });

  it("strips .git suffix", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo.git");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      refIsFullSha: false,
      type: "root",
    });
  });

  it("parses blob URL with ref and path", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/blob/main/src/index.ts");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
      refIsFullSha: false,
      path: "src/index.ts",
      type: "blob",
    });
  });

  it("parses tree URL", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/tree/develop/lib");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "develop",
      refIsFullSha: false,
      path: "lib",
      type: "tree",
    });
  });

  it("detects full SHA refs (40 hex chars)", () => {
    const sha = "a".repeat(40);
    const result = parseGitHubUrl(`https://github.com/owner/repo/blob/${sha}/README.md`);
    expect(result).not.toBeNull();
    expect(result!.refIsFullSha).toBe(true);
    expect(result!.ref).toBe(sha);
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("https://bitbucket.org/owner/repo")).toBeNull();
  });

  it("returns null for non-code segments (issues, pull, discussions, actions)", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo/issues")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/pull/42")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/discussions")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/actions")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
    expect(parseGitHubUrl("https://github.com/only-owner")).toBeNull();
    expect(parseGitHubUrl("")).toBeNull();
  });

  it("handles blob/tree with ref but no path (path = empty string)", () => {
    const blobResult = parseGitHubUrl("https://github.com/owner/repo/blob/main");
    expect(blobResult).not.toBeNull();
    expect(blobResult!.path).toBe("");
    expect(blobResult!.ref).toBe("main");
    expect(blobResult!.type).toBe("blob");

    const treeResult = parseGitHubUrl("https://github.com/owner/repo/tree/main");
    expect(treeResult).not.toBeNull();
    expect(treeResult!.path).toBe("");
    expect(treeResult!.ref).toBe("main");
    expect(treeResult!.type).toBe("tree");
  });
});
