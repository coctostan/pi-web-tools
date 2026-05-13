---
id: 21
title: Prune stale results disk files (&gt;24h) on session_start
status: approved
depends_on:
  - 19
no_test: false
files_to_modify:
  - session-results-store.ts
  - session-results-store.test.ts
  - index.ts
files_to_create: []
---

Add a `pruneStaleStoreFiles(dir, maxAgeMs)` helper and call it from every `session_start` arm. (Second half of AC-COMPACT-4.)

**Files:**
- Modify: `session-results-store.ts`
- Modify: `session-results-store.test.ts`
- Modify: `index.ts`

**Step 1 — Write the failing test**

Append to `session-results-store.test.ts`:

```ts
import { readdirSync, utimesSync } from "node:fs";

it("pruneStaleStoreFiles deletes files older than maxAgeMs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "web-tools-prune-"));
  const { writeStoreSnapshot, pruneStaleStoreFiles, resultsFilePath } = await import("./session-results-store.js");
  const oldPath = resultsFilePath("old", dir);
  const newPath = resultsFilePath("new", dir);
  writeStoreSnapshot(oldPath, []);
  writeStoreSnapshot(newPath, []);

  // Backdate the "old" file 2 days.
  const past = Date.now() / 1000 - 60 * 60 * 48;
  utimesSync(oldPath, past, past);

  pruneStaleStoreFiles(dir, 24 * 60 * 60 * 1000);

  const remaining = readdirSync(dir);
  expect(remaining).not.toContain("results-old.json");
  expect(remaining).toContain("results-new.json");

  rmSync(dir, { recursive: true, force: true });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run session-results-store.test.ts -t "pruneStaleStoreFiles deletes files older than maxAgeMs"`
Expected: FAIL — `Error: ... pruneStaleStoreFiles is not exported`

**Step 3 — Write minimal implementation**

In `session-results-store.ts`, add:

```ts
import { readdirSync, statSync } from "node:fs";

export function pruneStaleStoreFiles(dir: string, maxAgeMs: number): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith("results-") || !name.endsWith(".json")) continue;
    const full = join(dir, name);
    try {
      const stat = statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        deleteStoreFile(full);
      }
    } catch {
      // ignore
    }
  }
}
```

In `index.ts`, inside `handleSessionStart`, add at the very top (before the switch):

```ts
const initialDir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
pruneStaleStoreFiles(initialDir, 24 * 60 * 60 * 1000);
```

And add `pruneStaleStoreFiles` to the existing import from `./session-results-store.js`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run session-results-store.test.ts -t "pruneStaleStoreFiles deletes files older than maxAgeMs"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
