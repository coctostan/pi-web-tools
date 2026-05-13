---
id: 11
title: session_start "reload" preserves URL cache and temp files
status: approved
depends_on:
  - 7
no_test: false
files_to_modify:
  - index.test.ts
files_to_create: []
---

The existing `reload` test (lines 231–239 in `index.test.ts`) currently asserts `clearCloneCache` is NOT called. After Task 7's switch lands, `clearCloneCache()` IS called on reload (cloned repos are session-scoped); the test must be updated. This task formalizes AC-LIFECYCLE-3 with the corrected expectations and adds an assertion that `restoreFromSession` IS called on reload.

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Replace the existing test at lines 231–239 in `index.test.ts` with:

```ts
it('session_start with reason="reload" preserves URL cache and temp files but still clears clone cache and restores results (#036 AC-LIFECYCLE-3)', async () => {
  const handlers = await getSessionHandlers();
  const handler = handlers.get("session_start");
  expect(handler).toBeDefined();

  const getEntries = vi.fn(() => []);
  const ctx = { sessionManager: { getEntries, getSessionId: () => "reload-sid" } };
  await handler({ type: "session_start", reason: "reload" }, ctx as any);

  expect(state.clearUrlCache).not.toHaveBeenCalled();
  expect(offloadState.cleanupTempFiles).not.toHaveBeenCalled();
  expect(ghState.clearCloneCache).toHaveBeenCalled();
  expect(getEntries).toHaveBeenCalled();
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t 'session_start with reason="reload"'`
Expected: FAIL before Task 7's reload branch is fixed — `expect(ghState.clearCloneCache).toHaveBeenCalled()` reports 0 calls because the current inline reload branch only calls `restoreFromSession(ctx)` and returns.

**Step 3 — Write minimal implementation**

If Task 7's switch is wrong, fix the `case "reload":` arm to be exactly:

```ts
case "reload":
  clearCloneCache();
  restoreFromSession(ctx);
  return;
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t 'session_start with reason="reload"'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
