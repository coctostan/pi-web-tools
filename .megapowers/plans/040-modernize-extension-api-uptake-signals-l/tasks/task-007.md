---
id: 7
title: handleSessionStart receives SessionStartEvent and routes by reason
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Replace today's `pi.on("session_start", ...)` inline branching (which only special-cases `"reload"`) with a typed handler that receives the full `SessionStartEvent` and dispatches per-reason. Add a parameterized branch test for all five reasons. (AC-LIFECYCLE-1, AC-LIFECYCLE-2, AC-LIFECYCLE-3, AC-LIFECYCLE-4, AC-LIFECYCLE-5, AC-LIFECYCLE-6, AC-LIFECYCLE-7)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Replace the existing `for (const reason of ["startup", "new", "resume", "fork"] as const)` block and the existing `reload` lifecycle test in `index.test.ts` with this parameterized test:

```ts
describe("session_start reason dispatch (#036 AC-LIFECYCLE-7)", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  async function getSessionHandlerWithStorageSpies() {
    const actualStorage = await vi.importActual<typeof import("./storage.js")>("./storage.js");
    const clearResultsSpy = vi.fn(actualStorage.clearResults);
    const restoreFromSessionSpy = vi.fn();
    const restoreFromSessionFileSpy = vi.fn();

    vi.doMock("./storage.js", async () => ({
      ...actualStorage,
      clearResults: clearResultsSpy,
      restoreFromSession: restoreFromSessionSpy,
      restoreFromSessionFile: restoreFromSessionFileSpy,
    }));

    const handlers = new Map<string, any>();
    const pi = {
      on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
      registerTool: vi.fn(),
      appendEntry: vi.fn(),
    };
    const { default: registerExtension } = await import("./index.js");
    registerExtension(pi as any);
    const handler = handlers.get("session_start");
    if (!handler) throw new Error("session_start handler not registered");
    return { handler, clearResultsSpy, restoreFromSessionSpy, restoreFromSessionFileSpy };
  }

  const cases = [
    { reason: "startup", clearUrl: true, cleanup: true, clearResults: false, restore: true },
    { reason: "reload", clearUrl: false, cleanup: false, clearResults: false, restore: true },
    { reason: "new", clearUrl: true, cleanup: true, clearResults: true, restore: false },
    { reason: "resume", clearUrl: true, cleanup: true, clearResults: false, restore: true },
    { reason: "fork", clearUrl: true, cleanup: true, clearResults: false, restore: true },
  ] as const;

  it.each(cases)("routes session_start reason=$reason to the correct lifecycle calls", async ({ reason, clearUrl, cleanup, clearResults: shouldClearResults, restore }) => {
    const { handler, clearResultsSpy, restoreFromSessionSpy, restoreFromSessionFileSpy } = await getSessionHandlerWithStorageSpies();

    const ctx = { sessionManager: { getEntries: vi.fn(() => []), getSessionId: () => `${reason}-sid` } };
    await handler({ type: "session_start", reason }, ctx as any);

    expect(ghState.clearCloneCache).toHaveBeenCalledTimes(1);
    if (clearUrl) expect(state.clearUrlCache).toHaveBeenCalledTimes(1);
    else expect(state.clearUrlCache).not.toHaveBeenCalled();

    if (cleanup) expect(offloadState.cleanupTempFiles).toHaveBeenCalledTimes(1);
    else expect(offloadState.cleanupTempFiles).not.toHaveBeenCalled();

    if (shouldClearResults) expect(clearResultsSpy).toHaveBeenCalledTimes(1);
    else expect(clearResultsSpy).not.toHaveBeenCalled();

    if (restore) expect(restoreFromSessionSpy).toHaveBeenCalledWith(ctx);
    else expect(restoreFromSessionSpy).not.toHaveBeenCalled();
    expect(restoreFromSessionFileSpy).not.toHaveBeenCalled();
  });

  // The fork + previousSessionFile assertion is covered by Task 10 after
  // restoreFromSessionFile exists; this task covers the fork fallback branch.
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "routes session_start reason"`
Expected: FAIL — for `reason="reload"`, `expect(ghState.clearCloneCache).toHaveBeenCalledTimes(1)` receives 0 calls because the current inline reload branch only calls `restoreFromSession(ctx)` and returns.

**Step 3 — Write minimal implementation**

In `index.ts`, add the typed event import at the top:

```ts
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
```

Change the existing `handleSessionStart(ctx)` signature and body from:

```ts
function handleSessionStart(ctx: ExtensionContext): void {
  abortAllPending();
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  restoreFromSession(ctx);
}
```

to:

```ts
function handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void {
  switch (event.reason) {
    case "startup":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      restoreFromSession(ctx);
      return;
    case "reload":
      clearCloneCache();
      restoreFromSession(ctx);
      return;
    case "new":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      clearResults();
      return;
    case "resume":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      restoreFromSession(ctx);
      return;
    case "fork":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      restoreFromSession(ctx); // Task 10 will swap to previousSessionFile-aware restore.
      return;
  }
}
```

Replace the `pi.on("session_start", ...)` registration body with:

```ts
pi.on("session_start", async (event, ctx) => {
  handleSessionStart(event, ctx);
});
```

This removes the existing inline `if ((event as { reason?: string }).reason === "reload")` branch. The `startup` case order must remain exactly `clearCloneCache(); clearUrlCache(); cleanupTempFiles(); restoreFromSession(ctx);`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "routes session_start reason"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
