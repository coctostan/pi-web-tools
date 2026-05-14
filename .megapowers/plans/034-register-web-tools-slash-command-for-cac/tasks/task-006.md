---
id: 6
title: Create commands.ts with dispatch + help subcommand
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - commands.ts
  - commands.test.ts
---

Covers AC 3, AC 8, AC 11 (line cap).

**Files:**
- Create: `commands.ts`
- Create: `commands.test.ts`

**Step 1 — Write the failing test**
Create `commands.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { dispatch, type DispatchDeps } from "./commands.js";

function makeDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    getCacheStats: vi.fn(() => ({ entries: 0, hits: 0, misses: 0, oldest: null, newest: null, sizeBytes: 0, ttlMinutes: 1440 })),
    clearCache: vi.fn(),
    purgeExpired: vi.fn(),
    resetCounters: vi.fn(),
    listResults: vi.fn(() => []),
    confirm: vi.fn(async () => true),
    notify: vi.fn(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

describe("dispatch(help)", () => {
  it("notifies a usage summary listing the five subcommands", async () => {
    const deps = makeDeps();
    await dispatch("help", "", deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    for (const sub of ["stats", "clear-cache", "purge-expired", "recent", "help"]) {
      expect(msg).toContain(sub);
    }
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `Error: Failed to load url ./commands.js (resolved id: ./commands.js) ... Does the file exist?`

**Step 3 — Write minimal implementation**
Create `commands.ts`:
```ts
import type { CacheStats } from "./research-cache.js";
import type { StoredResultData } from "./storage.js";

export interface DispatchDeps {
  getCacheStats: () => CacheStats;
  clearCache: () => void;
  purgeExpired: () => void;
  resetCounters: () => void;
  listResults: () => StoredResultData[];
  confirm: (title: string, message: string) => Promise<boolean>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  now: () => number;
}

const SUBCOMMANDS = ["stats", "clear-cache", "purge-expired", "recent", "help"] as const;

function helpText(): string {
  return [
    "/web-tools subcommands:",
    "  stats          Show cache entry count, hits, misses, age, size, TTL",
    "  clear-cache    Remove all entries from the persistent research cache",
    "  purge-expired  Remove only entries past their TTL",
    "  recent         List recent session results (search/fetch/context)",
    "  help           Show this help",
  ].join("\n");
}

export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "help") {
    deps.notify(helpText(), "info");
    return;
  }
}

export const __test = { SUBCOMMANDS, helpText };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
