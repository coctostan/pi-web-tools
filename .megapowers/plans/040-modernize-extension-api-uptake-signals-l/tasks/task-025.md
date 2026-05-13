---
id: 25
title: Assert index.ts shrank vs the v4.0.0 baseline
status: approved
depends_on:
  - 5
  - 22
no_test: false
files_to_modify:
  - index.test.ts
files_to_create: []
---

Add a meta-test asserting that the final `index.ts` line count is strictly less than 1192 (its v4.0.0 line count as confirmed by `wc -l index.ts` at brainstorm time), and perform final batch verification with no newly skipped tests. (AC-BATCH-1, AC-BATCH-4)

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
import { readFileSync as _readFileLineCheck } from "node:fs";

describe("index.ts shrinkage (#040 AC-BATCH-4)", () => {
  it("index.ts is strictly shorter than the v4.0.0 baseline of 1192 lines", () => {
    const src = _readFileLineCheck("index.ts", "utf-8");
    const lineCount = src.endsWith("\n") ? src.split("\n").length - 1 : src.split("\n").length;
    expect(lineCount).toBeLessThan(1192);
  });
});
```

**Step 2 — Run test, verify it fails**

If the batch's earlier tasks landed correctly, line count should already be well below 1192 (Task 5 alone removed ~25 lines via `pendingFetches`/`abortAllPending`/per-tool wrappers). If FAIL, message will be `expect(lineCount).toBeLessThan(1192)` — received e.g. 1210.

Run: `npx vitest run index.test.ts -t "index.ts is strictly shorter than the v4.0.0 baseline"`
Expected after tasks 1–22: PASS.

**Step 3 — Write minimal implementation**

If failing despite earlier tasks, hunt for residual dead code: leftover empty `try { ... }` blocks from removed `pendingFetches` plumbing, unused imports, dead `combinedSignal` references. None expected.

**Step 4 — Run test, verify it passes**
Run: same command.
Expected: PASS

**Step 5 — Verify no regressions (AC-BATCH-1)**
Run: `npm test`
Expected: exit code 0; no new `.skip`/`.only` markers were introduced for tests that were previously enabled.
