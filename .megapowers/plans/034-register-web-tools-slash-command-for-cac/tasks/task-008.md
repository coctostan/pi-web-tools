---
id: 8
title: Empty/whitespace subcommand defaults to help
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - commands.ts
  - commands.test.ts
files_to_create: []
---

Covers AC 10.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected 'Unknown subcommand: "". Try /web-tools help.\n\n...' not to match /unknown subcommand/i` (empty subcommand currently falls through to the unknown handler from Task 7, which emits a `"warning"` notify whose message starts with `Unknown subcommand:`).

**Step 3 — Write minimal implementation**
Edit `dispatch` in `commands.ts` so empty/whitespace short-circuits to help:
```ts
export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "" || sub === "help") {
    deps.notify(helpText(), "info");
    return;
  }
  deps.notify(`Unknown subcommand: "${sub}". Try /web-tools help.\n\n${helpText()}`, "warning");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
