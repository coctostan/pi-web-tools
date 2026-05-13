---
id: 5
title: Remove pendingFetches Map and abortAllPending helper
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

After tasks 1–4 remove all callers of `pendingFetches.set` / `pendingFetches.delete`, delete the module-scope `Map` and the `abortAllPending()` helper, and remove their calls from `handleSessionStart` / `handleSessionShutdown`. (AC-CANCEL-5, AC-CANCEL-6)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
import { readFileSync as _readFileSyncForCancelCheck } from "node:fs";

describe("cancellation cleanup (#033 AC-CANCEL-5/6)", () => {
  it("index.ts has no references to pendingFetches or abortAllPending", () => {
    const src = _readFileSyncForCancelCheck("index.ts", "utf-8");
    expect(src).not.toMatch(/pendingFetches/);
    expect(src).not.toMatch(/abortAllPending/);
  });
});
```

(If `readFileSync` is already imported elsewhere in the file, reuse the existing import.)

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "index.ts has no references to pendingFetches or abortAllPending"`
Expected: FAIL — `expect(src).not.toMatch(/pendingFetches/)` matches at module scope and in `handleSessionStart` / `handleSessionShutdown`.

**Step 3 — Write minimal implementation**

In `index.ts`:

1. Delete the line `const pendingFetches = new Map<string, AbortController>();` near the top (currently line 36).
2. Delete the `function abortAllPending(): void { ... }` block (currently lines 46–51).
3. Inside `function handleSessionStart(ctx: ExtensionContext): void {` delete the `abortAllPending();` call (currently line 54).
4. Inside `function handleSessionShutdown(): void {` delete the `abortAllPending();` call (currently line 62).
5. If after deletions `generateId` is only imported but unused at module scope, leave the import — `storeResult`/`generateId` are still used by tool executors.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "index.ts has no references to pendingFetches or abortAllPending"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
