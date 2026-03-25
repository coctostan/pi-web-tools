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
    filterContent: vi.fn(),
  };
}

describe("runCli prompted fetch", () => {
  it("uses filterContent when available and writes focused output to stdout", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "# Example Page\n\nLong extracted body.",
      error: null,
    });
    vi.mocked(deps.filterContent!).mockResolvedValue({
      filtered: "Use `vi.fn()` to create a mock function.",
      model: "anthropic/claude-haiku-4-5",
    });

    const exitCode = await runCli(
      ["fetch", "https://example.com/page", "--prompt", "How do I mock a function?"],
      io,
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.filterContent).toHaveBeenCalledWith(
      "# Example Page\n\nLong extracted body.",
      "How do I mock a function?",
    );
    expect(stdout.join("\n")).toContain("Use `vi.fn()` to create a mock function.");
    expect(stdout.join("\n")).not.toContain("Long extracted body.");
    expect(stdout.join("\n")).not.toContain("# Example Page");
    expect(stderr).toEqual([]);
  });
});
