---
id: 4
title: Add clearCache(cacheFilePath) to research-cache.ts
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - research-cache.ts
  - research-cache.test.ts
files_to_create: []
---

Covers AC 15.

**Files:**
- Modify: `research-cache.ts`
- Test: `research-cache.test.ts`

**Step 1 — Write the failing test**
Append to `research-cache.test.ts`:
```ts
import { clearCache } from "./research-cache.js";
import { existsSync } from "node:fs";

describe("clearCache", () => {
  let tempDir: string;
  let cacheFilePath: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-research-cache-clear-"));
    cacheFilePath = join(tempDir, "research-cache.json");
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("empties all entries from an existing cache file", () => {
    putCache("https://a.com", "p", "m", "ans", 1440, cacheFilePath);
    expect(existsSync(cacheFilePath)).toBe(true);
    clearCache(cacheFilePath);
    expect(getCached("https://a.com", "p", "m", 1440, cacheFilePath)).toBeNull();
    // file may still exist but with empty object content
    const raw = JSON.parse(readFileSync(cacheFilePath, "utf-8"));
    expect(Object.keys(raw)).toHaveLength(0);
  });

  it("does not throw when cache file is missing", () => {
    expect(() => clearCache(join(tempDir, "nonexistent.json"))).not.toThrow();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run research-cache.test.ts`
Expected: FAIL — `SyntaxError: The requested module './research-cache.js' does not provide an export named 'clearCache'`

**Step 3 — Write minimal implementation**
Add to `research-cache.ts`:
```ts
export function clearCache(cacheFilePath: string): void {
  try {
    saveCache(cacheFilePath, {});
  } catch {
    // best-effort: missing file or write failure is tolerated
  }
}
```
(Note: `saveCache` already creates parent dirs and silently swallows errors; if file is missing it will simply write an empty object.)

**Step 4 — Run test, verify it passes**
Run: `npx vitest run research-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
