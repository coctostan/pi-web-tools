---
id: 7
title: Handle unknown subcommand in dispatch
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - commands.ts
  - commands.test.ts
files_to_create: []
---

Covers AC 9.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called at least once` (no notify for bogus subcommand)

**Step 3 — Write minimal implementation**
In `commands.ts`, add fallback before the function returns:
```ts
export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "help") {
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
