import { describe, it, expect, vi } from "vitest";
import { dispatch, type DispatchDeps } from "./commands.js";
import type { StoredResultData } from "./storage.js";

function makeDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    getCacheStats: vi.fn(() => ({ entries: 0, hits: 0, misses: 0, oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440, ok: true })),
    clearCache: vi.fn(),
    purgeExpired: vi.fn(),
    resetCounters: vi.fn(),
    listResults: vi.fn(() => []),
    confirm: vi.fn(async () => true),
    notify: vi.fn(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

describe("dispatch(help)", () => {
  it("notifies a usage summary listing the five subcommands", async () => {
    const deps = makeDeps();
    await dispatch("help", "", deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    for (const sub of ["stats", "clear-cache", "purge-expired", "recent", "help"]) {
      expect(msg).toContain(sub);
    }
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});


describe("dispatch(unknown)", () => {
  it("notifies an unknown-subcommand message and points at /web-tools help", async () => {
    const deps = makeDeps();
    await dispatch("bogus", "", deps);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls.map((c: any[]) => c[0]).join("\n");
    expect(msg.toLowerCase()).toContain("unknown subcommand");
    expect(msg).toMatch(/\/web-tools help|stats/);
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});


describe("dispatch(empty)", () => {
  it("empty or whitespace-only subcommand behaves like help (not unknown)", async () => {
    const deps = makeDeps();
    await dispatch("", "", deps);
    await dispatch("   ", "", deps);
    expect(deps.notify).toHaveBeenCalledTimes(2);
    for (const call of (deps.notify as any).mock.calls) {
      const msg = call[0] as string;
      const type = call[1];
      // Help-path message: does NOT start with the unknown-subcommand prefix
      expect(msg).not.toMatch(/unknown subcommand/i);
      // notify severity for help is "info", not "warning"
      expect(type ?? "info").toBe("info");
      expect(msg).toContain("stats");
      expect(msg).toContain("clear-cache");
      expect(msg).toContain("purge-expired");
      expect(msg).toContain("recent");
      expect(msg.split("\n").length).toBeLessThanOrEqual(20);
    }
  });
});


describe("dispatch(stats)", () => {
  it("prints entries, hits, misses, oldest, newest, sizeBytes, and ttlMinutes", async () => {
    const stats = {
      entries: 3, hits: 7, misses: 2,
      oldest: 1_700_000_000_000, newest: 1_700_000_500_000,
      sizeBytes: 1234, ttlMinutes: 1440, ok: true,
    };
    const deps = makeDeps({ getCacheStats: vi.fn(() => stats) });
    await dispatch("stats", "", deps);
    expect(deps.getCacheStats).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg).toMatch(/entries[^\n]*3/i);
    expect(msg).toMatch(/hits[^\n]*7/i);
    expect(msg).toMatch(/miss(es)?[^\n]*2/i);
    expect(msg).toContain("1234"); // sizeBytes
    expect(msg).toContain("1440"); // ttlMinutes
    expect(msg).toContain(new Date(stats.oldest).toISOString());
    expect(msg).toContain(new Date(stats.newest).toISOString());
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });


  it("reports an error when stats reports an unreadable cache", async () => {
    const deps = makeDeps({ getCacheStats: vi.fn(() => ({ entries: 0, hits: 0, misses: 0, oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440, ok: false } as any)) });
    await dispatch("stats", "", deps);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringMatching(/failed|unreadable/i), "error");
  });
});


describe("dispatch(clear-cache)", () => {
  it("does nothing when confirm resolves false", async () => {
    const deps = makeDeps({ confirm: vi.fn(async () => false) });
    await dispatch("clear-cache", "", deps);
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.clearCache).not.toHaveBeenCalled();
    expect(deps.resetCounters).not.toHaveBeenCalled();
  });

  it("clears cache and resets counters when confirm resolves true", async () => {
    const deps = makeDeps({ confirm: vi.fn(async () => true) });
    await dispatch("clear-cache", "", deps);
    expect(deps.clearCache).toHaveBeenCalledTimes(1);
    expect(deps.resetCounters).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });


  it("does not reset counters or report success when clearCache reports failure", async () => {
    const deps = makeDeps({ clearCache: vi.fn(() => false) as any });
    await dispatch("clear-cache", "", deps);
    expect(deps.clearCache).toHaveBeenCalledTimes(1);
    expect(deps.resetCounters).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(expect.stringMatching(/failed/i), "error");
  });
});


describe("dispatch(purge-expired)", () => {
  it("invokes purgeExpired and does NOT reset counters", async () => {
    const deps = makeDeps();
    await dispatch("purge-expired", "", deps);
    expect(deps.purgeExpired).toHaveBeenCalledTimes(1);
    expect(deps.resetCounters).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });

  it("reports an error when purgeExpired reports a save failure", async () => {
    const deps = makeDeps({ purgeExpired: vi.fn(() => ({ removed: 0, remaining: 0, saved: false })) });
    await dispatch("purge-expired", "", deps);
    expect(deps.purgeExpired).toHaveBeenCalledTimes(1);
    expect(deps.resetCounters).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(expect.stringMatching(/failed/i), "error");
  });
});


describe("dispatch(recent)", () => {
  it("lists one search, one fetch, one context entry with type/label/age/charCount within line cap", async () => {
    const now = 1_700_000_600_000;
    const entries: StoredResultData[] = [
      {
        id: "s1", type: "search", timestamp: now - 30_000,
        queries: [{ query: "typescript generics", answer: "abcdef", results: [], error: null }],
      },
      {
        id: "f1", type: "fetch", timestamp: now - 60_000,
        urls: [{ url: "https://example.com/page", title: "Example", content: "hello world", error: null }],
      },
      {
        id: "c1", type: "context", timestamp: now - 90_000,
        context: { query: "react hooks", content: "snippet body", error: null },
      },
    ];
    const deps = makeDeps({ listResults: vi.fn(() => entries), now: () => now });
    await dispatch("recent", "", deps);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg).toMatch(/search/);
    expect(msg).toMatch(/fetch/);
    expect(msg).toMatch(/context/);
    expect(msg).toContain("typescript generics");
    expect(msg).toContain("https://example.com/page");
    expect(msg).toContain("react hooks");
    // age formatting (e.g. "30s") and char counts
    expect(msg).toMatch(/30s|1m/);
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
