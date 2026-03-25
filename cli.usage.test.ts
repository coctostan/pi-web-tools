import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";

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

describe("runCli usage handling", () => {
  it("prints usage and exits 1 when no subcommand is provided", async () => {
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli([], io);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Usage: exa-tools <command>");
    expect(stderr.join("\n")).toContain("search");
    expect(stderr.join("\n")).toContain("code");
    expect(stderr.join("\n")).toContain("fetch");
  });

  it("prints an unknown-command error and exits 1", async () => {
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli(["wat"], io);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Unknown command: wat");
    expect(stderr.join("\n")).toContain("Usage: exa-tools <command>");
  });
});
