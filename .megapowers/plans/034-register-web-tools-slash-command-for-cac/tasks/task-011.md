---
id: 11
title: dispatch("purge-expired") invokes purge but not resetCounters
status: approved
depends_on:
  - 5
  - 6
no_test: false
files_to_modify:
  - commands.ts
  - commands.test.ts
files_to_create: []
---

Covers AC 6.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
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
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called once, but got 0` for `purgeExpired`.

**Step 3 — Write minimal implementation**
Add to `dispatch`:
```ts
  if (sub === "purge-expired") {
    deps.purgeExpired();
    deps.notify("Expired cache entries purged.", "info");
    return;
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
