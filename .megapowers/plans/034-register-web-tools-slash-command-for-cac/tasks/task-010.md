---
id: 10
title: dispatch("clear-cache") gates on confirm
status: approved
depends_on:
  - 4
  - 6
no_test: false
files_to_modify:
  - commands.ts
  - commands.test.ts
files_to_create: []
---

Covers AC 5.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
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
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called once, but got 0` for `confirm` (clear-cache currently hits unknown-handler).

**Step 3 — Write minimal implementation**
Add a clear-cache branch in `dispatch`:
```ts
  if (sub === "clear-cache") {
    const ok = await deps.confirm("Clear research cache?", "This removes all cached web-tools answers from disk.");
    if (!ok) { deps.notify("Clear cache cancelled.", "info"); return; }
    deps.clearCache();
    deps.resetCounters();
    deps.notify("Research cache cleared.", "info");
    return;
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
