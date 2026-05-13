---
id: 19
title: Rehydrate result store from disk on session_start
status: approved
depends_on:
  - 7
  - 17
  - 18
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Whenever `handleSessionStart` runs a branch that "restores" (`startup`, `reload`, `resume`, `fork`), also rehydrate from `results-<sessionId>.json` before/instead of `restoreFromSession(ctx)`. The disk file is authoritative. (AC-COMPACT-3, AC-COMPACT-6)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
describe("session_start rehydrates from disk (#032 AC-COMPACT-3/6)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads results-<sessionId>.json without reading the session log on reason="resume"', async () => {
    vi.resetModules();
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-rehydrate-"));
    const { writeStoreSnapshot, resultsFilePath } = await import("./session-results-store.js");
    const sessionId = "rehydrate-sid";
    writeStoreSnapshot(resultsFilePath(sessionId, dir), [
      { id: "from-disk", type: "search", timestamp: Date.now(), queries: [{ query: "q", answer: "a", results: [], error: null }] },
    ] as any);

    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    const getEntries = vi.fn(() => { throw new Error("session log should not be required when disk snapshot exists"); });
    const ctx = { sessionManager: { getEntries, getSessionId: () => sessionId }, webToolsResultsDir: dir };
    await handler({ type: "session_start", reason: "resume" }, ctx as any);

    const storage = await import("./storage.js");
    expect(storage.getResult("from-disk")).not.toBeNull();
    expect(getEntries).not.toHaveBeenCalled();

    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "loads results-<sessionId>.json without reading the session log"`
Expected: FAIL — `expect(storage.getResult("from-disk")).not.toBeNull()` receives `null` because `handleSessionStart` does not read the disk snapshot yet. If a partial implementation calls `restoreFromSession(ctx)` after loading the disk snapshot, the test fails with `Error: session log should not be required when disk snapshot exists`.

**Step 3 — Write minimal implementation**

In `index.ts`, add imports:

```ts
import { readStoreSnapshot, resultsFilePath, DEFAULT_RESULTS_DIR, deleteStoreFile } from "./session-results-store.js";
import { storeResult } from "./storage.js"; // already imported — verify
```

Add a helper that returns whether a usable disk snapshot was present:

```ts
function rehydrateFromDisk(ctx: ExtensionContext): boolean {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) return false;
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  const entries = readStoreSnapshot(resultsFilePath(sessionId, dir));
  if (entries.length === 0) return false;
  clearResults();
  for (const entry of entries) {
    if (entry && entry.id && entry.type) {
      storeResult(entry.id, entry);
    }
  }
  return true;
}
```

In `handleSessionStart`, use the helper in the restore branches and only replay the session log when no disk snapshot exists. For example:

```ts
case "resume":
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  if (!rehydrateFromDisk(ctx)) restoreFromSession(ctx);
  return;
```

Apply the same pattern to `startup` and `reload`. For `fork`, preserve Task 10's parent-file behavior but do not let session-log replay overwrite an existing same-session disk snapshot:

```ts
case "fork": {
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  const restoredFromDisk = rehydrateFromDisk(ctx);
  if (!restoredFromDisk) {
    if (event.previousSessionFile) restoreFromSessionFile(event.previousSessionFile);
    else restoreFromSession(ctx);
  }
  return;
}
```

For `"new"`, do not call `rehydrateFromDisk(ctx)`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "loads results-<sessionId>.json without reading the session log"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
