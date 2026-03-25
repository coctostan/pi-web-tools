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

describe("runCli prompted fetch fallback", () => {
  it("warns with the filter reason, prints raw markdown to stdout, and exits 0 when filter resolution returns no model", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "# Example Page\n\nLong extracted body.",
      error: null,
    });
    vi.mocked(deps.filterContent!).mockResolvedValue({
      filtered: null,
      reason: "No filter model available",
    });

    const exitCode = await runCli(
      ["fetch", "https://example.com/page", "--prompt", "How do I mock a function?"],
      io,
      deps,
    );

    expect(exitCode).toBe(0);
    expect(stderr.join("\n")).toBe("Warning: No filter model available");
    expect(stdout.join("\n")).toBe("# Example Page\n\nLong extracted body.");
  });

  it("forwards the custom reason from filterContent in the warning", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "# Example Page\n\nLong extracted body.",
      error: null,
    });
    vi.mocked(deps.filterContent!).mockResolvedValue({
      filtered: null,
      reason: "API key expired",
    });

    const exitCode = await runCli(
      ["fetch", "https://example.com/page", "--prompt", "How do I mock a function?"],
      io,
      deps,
    );

    expect(exitCode).toBe(0);
    expect(stderr.join("\n")).toBe("Warning: API key expired");
    expect(stdout.join("\n")).toBe("# Example Page\n\nLong extracted body.");
  });
});
