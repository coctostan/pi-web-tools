---
id: 17
title: Add disk-backed result-store persistence module
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - session-results-store.ts
  - session-results-store.test.ts
---

Create a new module that mirrors `research-cache.ts`'s read/write pattern for the session-level result store. (AC-COMPACT-1)

**Files:**
- Create: `session-results-store.ts`
- Create: `session-results-store.test.ts`

**Step 1 — Write the failing test**

Create `session-results-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resultsFilePath,
  writeStoreSnapshot,
  readStoreSnapshot,
  deleteStoreFile,
} from "./session-results-store.js";
import type { StoredResultData } from "./storage.js";

describe("session-results-store (#032 AC-COMPACT-1)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "web-tools-results-test-"));
  });

  it("resultsFilePath returns a per-session-id path under the given root", () => {
    expect(resultsFilePath("abc123", dir)).toBe(join(dir, "results-abc123.json"));
  });

  it("writeStoreSnapshot persists an array of stored results that readStoreSnapshot can load", () => {
    const sessionId = "sess-1";
    const path = resultsFilePath(sessionId, dir);
    const entries: StoredResultData[] = [
      { id: "r1", type: "search", timestamp: Date.now(), queries: [{ query: "q", answer: "a", results: [], error: null }] },
    ];
    writeStoreSnapshot(path, entries);
    expect(existsSync(path)).toBe(true);
    const loaded = readStoreSnapshot(path);
    expect(loaded).toEqual(entries);
  });

  it("readStoreSnapshot returns empty array for missing file", () => {
    expect(readStoreSnapshot(resultsFilePath("nope", dir))).toEqual([]);
  });

  it("deleteStoreFile removes the file (best-effort, no throw on missing)", () => {
    const path = resultsFilePath("sess-2", dir);
    writeStoreSnapshot(path, []);
    expect(existsSync(path)).toBe(true);
    deleteStoreFile(path);
    expect(existsSync(path)).toBe(false);
    // Second delete must not throw.
    expect(() => deleteStoreFile(path)).not.toThrow();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run session-results-store.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./session-results-store.js"`

**Step 3 — Write minimal implementation**

Create `session-results-store.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { StoredResultData } from "./storage.js";

export const DEFAULT_RESULTS_DIR = join(homedir(), ".pi", "cache", "web-tools");

export function resultsFilePath(sessionId: string, dir: string = DEFAULT_RESULTS_DIR): string {
  return join(dir, `results-${sessionId}.json`);
}

export function writeStoreSnapshot(filePath: string, entries: StoredResultData[]): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(entries), "utf-8");
  } catch {
    // best-effort
  }
}

export function readStoreSnapshot(filePath: string): StoredResultData[] {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredResultData[];
    return [];
  } catch {
    return [];
  }
}

export function deleteStoreFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // best-effort
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run session-results-store.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
