import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("runCli search command", () => {
  const originalEnv = process.env.EXA_API_KEY;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("dispatches search to existing Exa search logic and writes markdown to stdout", async () => {
    process.env.EXA_API_KEY = "exa-test-key";
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.searchExa).mockResolvedValue([
      { title: "Vitest docs", url: "https://vitest.dev", snippet: "Mocking guide" },
    ]);
    vi.mocked(deps.formatSearchResults).mockReturnValue(
      "1. **Vitest docs**\n   https://vitest.dev\n   Mocking guide",
    );

    const exitCode = await runCli(["search", "vitest mock fetch", "--n", "2"], io, deps);

    expect(exitCode).toBe(0);
    expect(deps.searchExa).toHaveBeenCalledWith("vitest mock fetch", {
      apiKey: "exa-test-key",
      numResults: 2,
    });
    expect(stdout.join("\n")).toContain("**Vitest docs**");
    expect(stderr).toEqual([]);
  });

  it("fails with a clear stderr error when EXA_API_KEY is missing", async () => {
    delete process.env.EXA_API_KEY;
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli(["search", "vitest mock fetch"], io, deps);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("EXA_API_KEY");
    expect(deps.searchExa).not.toHaveBeenCalled();
  });
});
