---
id: 3
title: Remove dead session_switch/session_fork/session_tree registrations from
  index.ts
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Addresses **Fixed When #1** (issue #026) part A. Drop the three `pi.on("session_switch"|"session_fork"|"session_tree", …)` calls. Reason-inspection on `session_start` is Task 4.

**Files:**
- Modify: `index.ts` (lines 139–149)
- Modify: `index.test.ts` (extend `session lifecycle` describe)

**Step 1 — Write the failing test**

Append the following inside the existing `describe("session lifecycle", …)` block in `index.test.ts`, immediately after the `session_shutdown does NOT call …` test (around line 240) and before the closing `});` of that describe:

```ts
  it("does NOT register removed lifecycle events session_switch/session_fork/session_tree", async () => {
    const handlers = await getSessionHandlers();
    expect(handlers.has("session_switch")).toBe(false);
    expect(handlers.has("session_fork")).toBe(false);
    expect(handlers.has("session_tree")).toBe(false);
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "does NOT register removed lifecycle events"`

Expected: FAIL — `AssertionError: expected true to be false` (current `index.ts:139,143,147` still registers all three handlers, so `handlers.has(...)` returns `true`).

**Step 3 — Write minimal implementation**

In `index.ts`, delete lines 139–149 (the three `pi.on("session_switch"…)`, `pi.on("session_fork"…)`, `pi.on("session_tree"…)` blocks). Verify with:

```bash
grep -n "session_switch\|session_fork\|session_tree" index.ts
```

Should produce no matches. The `pi.on("session_start", …)` at ~line 135 and `pi.on("session_shutdown", …)` at ~line 151 stay untouched in this task.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "does NOT register removed lifecycle events"`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: All previous tests still pass (Task 2 already merged; count is now ~260). The existing `calls clearUrlCache on session_start` test continues to pass because the `session_start` handler is unchanged in this task.
