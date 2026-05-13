---
id: 20
title: Delete the results disk file on session_shutdown
status: approved
depends_on:
  - 7
  - 17
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

On `session_shutdown`, best-effort-delete the per-session results file. (First half of AC-COMPACT-4.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
describe("session_shutdown disk cleanup (#032 AC-COMPACT-4)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deletes results-<sessionId>.json on session_shutdown", async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-shutdown-"));
    const { writeStoreSnapshot, resultsFilePath } = await import("./session-results-store.js");
    const sessionId = "shutdown-sid";
    const filePath = resultsFilePath(sessionId, dir);
    writeStoreSnapshot(filePath, []);
    expect(_existsCompact(filePath)).toBe(true);

    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_shutdown");

    // Re-register a session_start first so the handler knows the current session id.
    const startHandler = handlers.get("session_start");
    await startHandler({ type: "session_start", reason: "startup" }, { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any);

    await handler({ type: "session_shutdown", reason: "quit" }, { sessionManager: { getEntries: () => [], getSessionId: () => sessionId }, webToolsResultsDir: dir } as any);

    expect(_existsCompact(filePath)).toBe(false);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});
```

**Step 2 — Run test, verify it fails**

Note: today's `session_shutdown` handler takes **no** ctx argument (`async () => { handleSessionShutdown(); }`). The handler signature must change to accept `(event, ctx)` and forward `ctx` so `getSessionId()` works.

Run: `npx vitest run index.test.ts -t "deletes results-<sessionId>.json on session_shutdown"`
Expected: FAIL — `expect(_existsCompact(filePath)).toBe(false)` — received true.

**Step 3 — Write minimal implementation**

In `index.ts`, change:

```ts
pi.on("session_shutdown", async () => {
  handleSessionShutdown();
});
```

to:

```ts
pi.on("session_shutdown", async (_event, ctx) => {
  handleSessionShutdown(ctx);
});
```

And change `function handleSessionShutdown(): void {` to `function handleSessionShutdown(ctx: ExtensionContext): void {` and add at the top of its body:

```ts
const sessionId = ctx.sessionManager.getSessionId();
if (sessionId) {
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  deleteStoreFile(resultsFilePath(sessionId, dir));
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "deletes results-<sessionId>.json on session_shutdown"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
