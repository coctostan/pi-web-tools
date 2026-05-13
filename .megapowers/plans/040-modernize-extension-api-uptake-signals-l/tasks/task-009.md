---
id: 9
title: Add restoreFromSessionFile helper that reads parent session log
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - storage.ts
  - storage.test.ts
files_to_create:
  - storage.test.ts
---

Add a new exported `restoreFromSessionFile(path: string)` helper in `storage.ts` that calls `loadEntriesFromFile(path)` from `@earendil-works/pi-coding-agent` and applies the same filter/restore logic as `restoreFromSession`. (Required by AC-LIFECYCLE-6.)

**Files:**
- Modify: `storage.ts`
- Modify: `storage.test.ts`

**Step 1 — Write the failing test**

Append to `storage.test.ts`:

```ts
import { vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  loadEntriesFromFile: vi.fn(() => [
    { type: "custom", customType: "web-tools-results", data: { id: "from-parent", type: "search", timestamp: Date.now(), queries: [] } },
  ]),
}));

describe("restoreFromSessionFile (#036 AC-LIFECYCLE-6)", () => {
  beforeEach(() => { clearResults(); vi.clearAllMocks(); });

  it("loads entries from the given session-file path and rehydrates the in-memory store", async () => {
    const { restoreFromSessionFile } = await import("./storage.js");
    restoreFromSessionFile("/tmp/parent.session");
    const restored = getResult("from-parent");
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe("from-parent");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run storage.test.ts -t "loads entries from the given session-file path"`
Expected: FAIL — `SyntaxError: The requested module './storage.js' does not provide an export named 'restoreFromSessionFile'`

**Step 3 — Write minimal implementation**

In `storage.ts`, add this near the bottom (after `restoreFromSession`):

```ts
import { loadEntriesFromFile } from "@earendil-works/pi-coding-agent";

export function restoreFromSessionFile(sessionFilePath: string): void {
  const now = Date.now();
  let entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
  try {
    entries = loadEntriesFromFile(sessionFilePath) as Array<{ type: string; customType?: string; data?: unknown }>;
  } catch {
    return; // missing file or parse error: leave store as-is
  }

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== "web-tools-results") continue;
    const data = entry.data as StoredResultData | undefined;
    if (!data || !data.id || !data.type) continue;
    if (data.type === "search" && !Array.isArray(data.queries)) continue;
    if (data.type === "fetch" && !Array.isArray(data.urls)) continue;
    if (data.type === "context" && (!data.context || typeof data.context.query !== "string")) continue;
    if (data.timestamp && now - data.timestamp > ONE_HOUR_MS) continue;
    store.set(data.id, data);
  }

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
```

Move the `import { loadEntriesFromFile } from "@earendil-works/pi-coding-agent";` to the top of the file with the other imports (currently `storage.ts` has no top-of-file imports — add a fresh import block at line 1).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run storage.test.ts -t "loads entries from the given session-file path"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
