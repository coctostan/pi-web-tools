---
id: 6
title: Call clearUrlCache() in onSessionStart in index.ts
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers AC 6. Each new session begins with an empty URL cache. `clearUrlCache` is added to the `handleSessionStart` function in `index.ts` alongside the existing `clearCloneCache()` and `cleanupTempFiles()` calls.

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

1. In `index.test.ts`, update the hoisted `state` object to include `clearUrlCache`:

```ts
const state = vi.hoisted(() => ({
  extractContent: vi.fn(),
  filterContent: vi.fn(),
  clearUrlCache: vi.fn(),  // ← add this
}));
```

2. Update the `vi.mock("./extract.js", ...)` factory to include `clearUrlCache`:

```ts
vi.mock("./extract.js", () => ({
  extractContent: state.extractContent,
  fetchAllContent: vi.fn(),
  clearUrlCache: state.clearUrlCache,  // ← add this
}));
```

3. Add a helper function and a new describe block (add after the existing helpers like `getToolResultHandler`):

```ts
async function getSessionHandlers() {
  vi.resetModules();
  const handlers = new Map<string, any>();
  const pi = {
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  return handlers;
}

describe("session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls clearUrlCache on session_start", async () => {
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    expect(handler).toBeDefined();
    const ctx = {
      sessionManager: {
        getEntries: () => [],
      },
    };

    await handler({}, ctx as any);
    expect(state.clearUrlCache).toHaveBeenCalled();
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`
Expected: FAIL - `AssertionError: expected "spy" to have been called`

(With a valid `ctx.sessionManager.getEntries()` stub, the pre-implementation failure is the assertion because `handleSessionStart` does not yet call `clearUrlCache`.)

**Step 3 — Write minimal implementation**

1. In `index.ts`, add `clearUrlCache` to the import from `./extract.js`:

```ts
import { extractContent, fetchAllContent, clearUrlCache } from "./extract.js";
```

2. In the `handleSessionStart` function, add `clearUrlCache()` alongside the other cache-clearing calls:

```ts
function handleSessionStart(ctx: ExtensionContext): void {
  abortAllPending();
  clearCloneCache();
  clearUrlCache();       // ← add this line
  cleanupTempFiles();
  sessionActive = true;
  restoreFromSession(ctx);
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass
