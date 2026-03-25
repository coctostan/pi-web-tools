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

describe("runCli code command", () => {
  const originalEnv = process.env.EXA_API_KEY;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("dispatches code search to existing context logic and writes content to stdout", async () => {
    process.env.EXA_API_KEY = "exa-test-key";
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.searchContext).mockResolvedValue({
      query: "vitest mock fetch",
      content: "```ts\nvi.fn()\n```",
    });

    const exitCode = await runCli(["code", "vitest mock fetch", "--tokens", "800"], io, deps);

    expect(exitCode).toBe(0);
    expect(deps.searchContext).toHaveBeenCalledWith("vitest mock fetch", {
      apiKey: "exa-test-key",
      tokensNum: 800,
    });
    expect(stdout.join("\n")).toContain("vi.fn()");
    expect(stderr).toEqual([]);
  });

  it("fails with a clear stderr error when EXA_API_KEY is missing", async () => {
    delete process.env.EXA_API_KEY;
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli(["code", "vitest mock fetch"], io, deps);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("EXA_API_KEY");
    expect(deps.searchContext).not.toHaveBeenCalled();
  });
});
