---
id: 10
title: session_start "fork" branch uses event.previousSessionFile
status: approved
depends_on:
  - 7
  - 9
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Wire the `"fork"` branch of `handleSessionStart` to call `restoreFromSessionFile(event.previousSessionFile)` when set, falling back to `restoreFromSession(ctx)` otherwise. (AC-LIFECYCLE-6)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`. This test uses `vi.doMock` before importing `index.ts` so the spies are installed on the same `storage.ts` module instance that `index.ts` imports:

```ts
describe('session_start "fork" branch (#036 AC-LIFECYCLE-6)', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  async function getForkHandlerWithStorageSpies() {
    const restoreFromSessionSpy = vi.fn();
    const restoreFromSessionFileSpy = vi.fn();
    vi.doMock("./storage.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./storage.js")>();
      return {
        ...actual,
        restoreFromSession: restoreFromSessionSpy,
        restoreFromSessionFile: restoreFromSessionFileSpy,
      };
    });

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
    return { handler, restoreFromSessionSpy, restoreFromSessionFileSpy };
  }

  it('calls restoreFromSessionFile(event.previousSessionFile) when set', async () => {
    const { handler, restoreFromSessionSpy, restoreFromSessionFileSpy } = await getForkHandlerWithStorageSpies();
    const ctx = { sessionManager: { getEntries: () => [], getSessionId: () => "child" } };

    await handler({ type: "session_start", reason: "fork", previousSessionFile: "/tmp/parent.session" }, ctx as any);

    expect(restoreFromSessionFileSpy).toHaveBeenCalledWith("/tmp/parent.session");
    expect(restoreFromSessionSpy).not.toHaveBeenCalled();
  });

  it('falls back to restoreFromSession(ctx) when previousSessionFile is absent', async () => {
    const { handler, restoreFromSessionSpy, restoreFromSessionFileSpy } = await getForkHandlerWithStorageSpies();
    const ctx = { sessionManager: { getEntries: () => [], getSessionId: () => "child" } };

    await handler({ type: "session_start", reason: "fork" }, ctx as any);

    expect(restoreFromSessionFileSpy).not.toHaveBeenCalled();
    expect(restoreFromSessionSpy).toHaveBeenCalledWith(ctx);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "calls restoreFromSessionFile(event.previousSessionFile)"`
Expected: FAIL — `expect(restoreFromSessionFileSpy).toHaveBeenCalledWith("/tmp/parent.session")` reports 0 calls because the current `"fork"` branch calls `restoreFromSession(ctx)` only.

**Step 3 — Write minimal implementation**

In `index.ts`, add `restoreFromSessionFile` to the import block:

```ts
import {
  generateId,
  storeResult,
  getResult,
  getAllResults,
  clearResults,
  restoreFromSession,
  restoreFromSessionFile,    // new
  type StoredResultData,
  type QueryResultData,
  type ExtractedContent,
  type ContextResultData,
} from "./storage.js";
```

In `handleSessionStart`, change the `case "fork":` arm to:

```ts
case "fork":
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  if (event.previousSessionFile) {
    restoreFromSessionFile(event.previousSessionFile);
  } else {
    restoreFromSession(ctx);
  }
  return;
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "calls restoreFromSessionFile(event.previousSessionFile)"` and `npx vitest run index.test.ts -t "falls back to restoreFromSession(ctx) when previousSessionFile is absent"`
Expected: both PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
