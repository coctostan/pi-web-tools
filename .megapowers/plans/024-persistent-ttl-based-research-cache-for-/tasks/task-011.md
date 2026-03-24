---
id: 11
title: "index.ts: session_shutdown does not clear persistent cache"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - index.test.ts
files_to_create: []
---

### Task 11: index.ts: session_shutdown does not clear persistent cache [depends: 8]

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Add to `index.test.ts` inside the `session lifecycle` describe block:

```typescript
  it("session_shutdown does NOT call any cache-clearing function from research-cache", async () => {
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_shutdown");
    expect(handler).toBeDefined();

    await handler({});

    // research-cache has no clearCache function exported — the test validates
    // that the persistent cache module is never touched during shutdown.
    // The in-memory clearResults IS called (existing behavior), but
    // research-cache functions are not.
    expect(cacheState.getCached).not.toHaveBeenCalled();
    expect(cacheState.putCache).not.toHaveBeenCalled();
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: PASS — this should pass immediately since `handleSessionShutdown()` only calls `clearResults()` (in-memory store), not any research-cache function. This test explicitly verifies AC 7.

**Step 3 — No new implementation needed**

The existing `handleSessionShutdown()` function (line 56-62) only clears the in-memory store and resets config cache. It does not touch the persistent cache, which is the correct behavior per AC 7.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
