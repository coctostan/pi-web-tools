---
id: 8
title: session_start "new" reason clears the in-memory result store
status: approved
depends_on:
  - 7
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
  - storage.ts
files_to_create: []
---

For `reason: "new"`, the spec requires `clearResults()` and **no** `restoreFromSession`. (AC-LIFECYCLE-4)

**Files:**
- Modify: `index.ts`
- Modify: `storage.ts` (only if `clearResults` is not already exported — it is, verified at line 81)
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
describe('session_start "new" (#036 AC-LIFECYCLE-4)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('clears the in-memory result store and does NOT call restoreFromSession', async () => {
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    expect(handler).toBeDefined();

    // Seed after getSessionHandlers() so index.ts and the test share the same storage.ts module instance.
    const storage = await import("./storage.js");
    storage.storeResult("pre-new", { id: "pre-new", type: "search", timestamp: Date.now(), queries: [] });
    expect(storage.getResult("pre-new")).not.toBeNull();

    const getEntries = vi.fn(() => [{ type: "custom", customType: "web-tools-results", data: { id: "should-not-restore", type: "search", timestamp: Date.now(), queries: [] } }]);
    await handler({ type: "session_start", reason: "new" }, { sessionManager: { getEntries, getSessionId: () => "new-sid" } } as any);

    expect(storage.getResult("pre-new")).toBeNull();
    expect(getEntries).not.toHaveBeenCalled();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t 'clears the in-memory result store and does NOT call restoreFromSession'`
Expected: FAIL before Task 7's new branch is implemented — `expect(storage.getResult("pre-new")).toBeNull()` receives the seeded stored result because the current handler calls `restoreFromSession(ctx)` instead of `clearResults()` for `reason: "new"`.

**Step 3 — Write minimal implementation**

Ensure the `case "new":` arm in `handleSessionStart` invokes `clearResults()` and skips `restoreFromSession(ctx)`:

```ts
case "new":
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  clearResults();
  return;
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t 'clears the in-memory result store and does NOT call restoreFromSession'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
