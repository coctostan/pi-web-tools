---
id: 14
title: handleSessionStart calls resetCounters() for every reason
status: approved
depends_on:
  - 1
  - 13
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers AC 17.

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**
Append to `index.test.ts`:
```ts
describe("session_start resets cache counters (AC 17)", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it.each(["startup", "reload", "new", "resume", "fork"] as const)(
    "session_start reason=%s invokes resetCounters",
    async (reason) => {
      const resetCountersSpy = vi.fn();
      vi.doMock("./research-cache.js", () => ({
        getCached: vi.fn(() => null),
        putCache: vi.fn(),
        getCacheStats: vi.fn(() => ({ entries: 0, hits: 0, misses: 0, oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440 })),
        clearCache: vi.fn(),
        purgeExpired: vi.fn(),
        resetCounters: resetCountersSpy,
      }));
      const handlers = new Map<string, any>();
      const pi = {
        on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
        registerTool: vi.fn(),
        registerCommand: vi.fn(),
        appendEntry: vi.fn(),
      };
      const { default: registerExtension } = await import("./index.js");
      registerExtension(pi as any);
      const handler = handlers.get("session_start");
      expect(handler).toBeDefined();
      await handler({ type: "session_start", reason }, { sessionManager: { getEntries: () => [], getSessionId: () => `${reason}-sid` } } as any);
      expect(resetCountersSpy).toHaveBeenCalledTimes(1);
    },
  );
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "resets cache counters"`
Expected: FAIL — `AssertionError: expected "spy" to be called 1 times, but got 0 times` (handleSessionStart does not call resetCounters yet).

**Step 3 — Write minimal implementation**
Edit `handleSessionStart` in `index.ts` to call `resetCounters()` once at entry (before the `switch`). Also import `resetCounters` (already imported in Task 13). The simplest place:

```ts
function handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void {
  resetCounters();
  const initialDir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  pruneStaleStoreFiles(initialDir, 24 * 60 * 60 * 1000);
  // ... existing switch unchanged
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "resets cache counters"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
