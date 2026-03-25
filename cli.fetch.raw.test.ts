import { describe, expect, it, vi } from "vitest";
import { runCli, type CliDeps } from "./cli.js";

function makeIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

function makeDeps(): CliDeps {
  return {
    searchExa: vi.fn(),
    formatSearchResults: vi.fn(),
    searchContext: vi.fn(),
    extractContent: vi.fn(),
  };
}

describe("runCli fetch command", () => {
  it("writes full extracted markdown to stdout when no prompt is provided", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "# Example Page\n\nThis is the extracted body.",
      error: null,
    });

    const exitCode = await runCli(["fetch", "https://example.com/page"], io, deps);
    expect(exitCode).toBe(0);
    expect(deps.extractContent).toHaveBeenCalledWith("https://example.com/page");
    expect(stdout.join("\n")).toBe("# Example Page\n\nThis is the extracted body.");
    expect(stdout.join("\n")).not.toContain("Full content saved to");
    expect(stderr).toEqual([]);
  });

  it("writes fetch errors to stderr and exits 1", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "",
      content: "",
      error: "HTTP 404 Not Found",
    });

    const exitCode = await runCli(["fetch", "https://example.com/page"], io, deps);
    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("HTTP 404 Not Found");
  });
});
