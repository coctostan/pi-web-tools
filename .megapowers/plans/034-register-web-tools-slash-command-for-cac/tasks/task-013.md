---
id: 13
title: Register /web-tools command with subcommand autocomplete in index.ts
status: approved
depends_on:
  - 6
  - 7
  - 8
  - 9
  - 10
  - 11
  - 12
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers AC 1, AC 2, AC 18, AC 19 (real bindings wiring resetCounters only on clear-cache).

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**
Append a new `describe` block to `index.test.ts`:
```ts
describe("/web-tools slash command registration", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  async function loadExtensionWithCommandSpy() {
    const commands = new Map<string, any>();
    const pi = {
      on: vi.fn(),
      registerTool: vi.fn(),
      registerCommand: vi.fn((name: string, opts: any) => commands.set(name, { name, ...opts })),
      appendEntry: vi.fn(),
    };
    const { default: registerExtension } = await import("./index.js");
    registerExtension(pi as any);
    return { pi, commands };
  }

  it("registers a single /web-tools command with a description", async () => {
    const { pi, commands } = await loadExtensionWithCommandSpy();
    expect(pi.registerCommand).toHaveBeenCalledTimes(1);
    const cmd = commands.get("web-tools");
    expect(cmd).toBeDefined();
    expect(typeof cmd.description).toBe("string");
    expect(cmd.description.length).toBeGreaterThan(0);
    expect(typeof cmd.handler).toBe("function");
    expect(typeof cmd.getArgumentCompletions).toBe("function");
  });

  it("getArgumentCompletions returns the five subcommands filtered by prefix", async () => {
    const { commands } = await loadExtensionWithCommandSpy();
    const cmd = commands.get("web-tools");
    const all = await cmd.getArgumentCompletions("");
    expect(all.map((i: any) => i.value).sort()).toEqual(
      ["clear-cache", "help", "purge-expired", "recent", "stats"],
    );
    const filtered = await cmd.getArgumentCompletions("pur");
    expect(filtered.map((i: any) => i.value)).toEqual(["purge-expired"]);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "slash command registration"`
Expected: FAIL — `TypeError: pi.registerCommand is not a function` (currently `index.ts` does not call `pi.registerCommand`).

**Step 3 — Write minimal implementation**
Edit `index.ts`. Add imports near the top of the file (after the existing imports):
```ts
import { dispatch } from "./commands.js";
import { getCacheStats, clearCache, purgeExpired, resetCounters } from "./research-cache.js";
```

Inside the default exported function (after the existing `pi.on(...)` registrations and tool registrations), add:
```ts
  // ---------------------------------------------------------------------------
  // Slash command: /web-tools
  // ---------------------------------------------------------------------------
  const SUBCOMMAND_NAMES = ["stats", "clear-cache", "purge-expired", "recent", "help"];

  pi.registerCommand("web-tools", {
    description: "Inspect and manage the pi-web-tools research cache and session results.",
    getArgumentCompletions: (prefix: string) => {
      const items = SUBCOMMAND_NAMES
        .filter((n) => n.startsWith(prefix))
        .map((n) => ({ value: n, label: n }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: any) => {
      const trimmed = (args ?? "").trim();
      const [sub, ...rest] = trimmed.split(/\s+/);
      const subArgs = rest.join(" ");
      const cfg = getConfig();
      await dispatch(sub ?? "", subArgs, {
        getCacheStats: () => getCacheStats(DEFAULT_CACHE_FILE, cfg.cacheTTLMinutes),
        clearCache: () => clearCache(DEFAULT_CACHE_FILE),
        purgeExpired: () => purgeExpired(DEFAULT_CACHE_FILE),
        resetCounters: () => resetCounters(),
        listResults: () => getAllResults(),
        confirm: (title: string, message: string) => ctx.ui.confirm(title, message),
        notify: (msg: string, type?: "info" | "warning" | "error") => ctx.ui.notify(msg, type ?? "info"),
        now: () => Date.now(),
      });
    },
  });
```

Note: the real-binding lambdas above satisfy AC 18 (clear-cache → resetCounters happens inside `dispatch`) and AC 19 (purge-expired binding does NOT call resetCounters). The fact that `dispatch("clear-cache")` invokes its `resetCounters` dep and `dispatch("purge-expired")` does not is already enforced by Tasks 10 and 11.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "slash command registration"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
