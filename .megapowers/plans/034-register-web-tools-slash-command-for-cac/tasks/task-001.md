---
id: 1
title: Add hits/misses counters + resetCounters() to research-cache.ts
status: approved
depends_on: []
no_test: false
files_to_modify:
  - research-cache.ts
  - research-cache.test.ts
files_to_create: []
---

Covers AC 14 and bootstraps state for AC 12.

**Files:**
- Modify: `research-cache.ts`
- Test: `research-cache.test.ts`

**Step 1 — Write the failing test**
Append to `research-cache.test.ts`:
```ts
import { resetCounters, getHitsForTest, getMissesForTest } from "./research-cache.js";

describe("resetCounters", () => {
  it("zeros internal hits and misses counters", () => {
    // Simulate counters being non-zero by importing internal getters
    resetCounters();
    expect(getHitsForTest()).toBe(0);
    expect(getMissesForTest()).toBe(0);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `SyntaxError: The requested module './research-cache.js' does not provide an export named 'resetCounters'`

**Step 3 — Write minimal implementation**
In `research-cache.ts`, add at module scope (near the top, after imports):
```ts
let hits = 0;
let misses = 0;

export function resetCounters(): void {
  hits = 0;
  misses = 0;
}

// test-only accessors so unit tests can verify counter mutations
export function getHitsForTest(): number { return hits; }
export function getMissesForTest(): number { return misses; }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
