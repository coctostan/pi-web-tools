---
id: 10
title: Add FILE_FIRST_PREVIEW_SIZE constant to offload.ts
status: approved
depends_on: []
no_test: false
files_to_modify:
  - offload.ts
  - offload.test.ts
files_to_create: []
---

### Task 10: Add FILE_FIRST_PREVIEW_SIZE constant to offload.ts

**AC covered:** AC 16

**Files:**
- Modify: `offload.ts`
- Test: `offload.test.ts`

**Step 1 — Write the failing test**

Add to `offload.test.ts`, at the bottom of the file (inside the `describe("offload", ...)` block), update the existing "exports expected constants" test and add a new one:

```typescript
it("exports FILE_FIRST_PREVIEW_SIZE as 500", () => {
  expect(FILE_FIRST_PREVIEW_SIZE).toBe(500);
});
```

Also update the import at the top of `offload.test.ts` to include `FILE_FIRST_PREVIEW_SIZE`:

```typescript
import {
  shouldOffload,
  offloadToFile,
  buildOffloadResult,
  cleanupTempFiles,
  FILE_OFFLOAD_THRESHOLD,
  PREVIEW_SIZE,
  FILE_FIRST_PREVIEW_SIZE,
} from "./offload.js";
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run offload.test.ts -t "exports FILE_FIRST_PREVIEW_SIZE as 500"`

Expected: FAIL — `SyntaxError: The requested module './offload.js' does not provide an export named 'FILE_FIRST_PREVIEW_SIZE'`

**Step 3 — Write minimal implementation**

In `offload.ts`, add after the existing `PREVIEW_SIZE` constant (line 7):

```typescript
export const FILE_FIRST_PREVIEW_SIZE = 500;
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run offload.test.ts -t "exports FILE_FIRST_PREVIEW_SIZE as 500"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.
