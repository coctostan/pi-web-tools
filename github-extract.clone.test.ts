import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "oversize" as "oversize" | "clone-fail" | "clone-throw",
  rmSync: vi.fn(),
}));

vi.mock("./config.js", () => ({
  getConfig: () => ({
    exaApiKey: null,
    github: {
      maxRepoSizeMB: 1,
      cloneTimeoutSeconds: 1,
      clonePath: "/tmp/pi-github-repos-test",
    },
  }),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<any>("node:fs");
  return {
    ...actual,
    rmSync: state.rmSync,
    existsSync: vi.fn(() => false),
    statSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => ""),
    openSync: vi.fn(),
    readSync: vi.fn(() => 0),
    closeSync: vi.fn(),
  };
});

vi.mock("node:child_process", () => ({
  execFile: (cmd: string, args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
    const joined = [cmd, ...args].join(" ");

    if (joined.includes("gh api") && joined.includes("--jq") && joined.includes(".size")) {
      if (state.mode === "oversize") {
        cb(null, "999999", "");
      } else {
        cb(null, "10", "");
      }
      return { on() {}, kill() {} };
    }

    if (joined.startsWith("gh repo clone") || joined.startsWith("git clone")) {
      if (state.mode === "clone-throw") {
        throw new Error("clone exploded");
      }
      if (state.mode === "clone-fail") {
        cb(new Error("clone failed"), "", "");
      } else {
        cb(null, "", "");
      }
      return { on() {}, kill() {} };
    }

    cb(new Error(`unexpected command: ${joined}`), "", "");
    return { on() {}, kill() {} };
  },
}));

describe("extractGitHub clone behavior", () => {
  beforeEach(() => {
    state.mode = "oversize";
    state.rmSync.mockReset();
    vi.resetModules();
  });

  it("skips cloning oversized repos and returns a helpful message", async () => {
    const { extractGitHub } = await import("./github-extract.js");

    const result = await extractGitHub("https://github.com/owner/repo");
    expect(result).not.toBeNull();
    expect(result!.content).toMatch(/Skipping clone/i);
    expect(result!.content).toMatch(/forceClone: true/i);
  });

  it("cleans up local clone path when clone fails", async () => {
    state.mode = "clone-fail";

    const { extractGitHub, clearCloneCache } = await import("./github-extract.js");

    const result = await extractGitHub("https://github.com/owner/repo");
    expect(result).toBeNull();

    const expectedPath = "/tmp/pi-github-repos-test/owner/repo";
    const expectedOptions = { recursive: true, force: true };
    const matchingCalls = state.rmSync.mock.calls.filter(
      ([path, options]) => path === expectedPath && JSON.stringify(options) === JSON.stringify(expectedOptions)
    );

    expect(matchingCalls.length).toBeGreaterThan(1);

    clearCloneCache();
  });

  it("returns null and cleans up when clone command throws unexpectedly", async () => {
    state.mode = "clone-throw";

    const { extractGitHub, clearCloneCache } = await import("./github-extract.js");

    await expect(extractGitHub("https://github.com/owner/repo")).resolves.toBeNull();

    const expectedPath = "/tmp/pi-github-repos-test/owner/repo";
    const expectedOptions = { recursive: true, force: true };
    const matchingCalls = state.rmSync.mock.calls.filter(
      ([path, options]) => path === expectedPath && JSON.stringify(options) === JSON.stringify(expectedOptions)
    );

    expect(matchingCalls.length).toBeGreaterThan(1);

    clearCloneCache();
  });
});
