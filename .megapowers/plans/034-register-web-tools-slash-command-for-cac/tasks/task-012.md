---
id: 12
title: dispatch("recent") lists mixed-type session entries
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - commands.ts
  - commands.test.ts
files_to_create: []
---

Covers AC 7, AC 11, AC 22.

`StoredResultData` shape (from `storage.ts`):
```ts
{ id: string; type: "search" | "fetch" | "context"; timestamp: number;
  queries?: QueryResultData[]; urls?: ExtractedContent[]; context?: ContextResultData }
```

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
import type { StoredResultData } from "./storage.js";

describe("dispatch(recent)", () => {
  it("lists one search, one fetch, one context entry with type/label/age/charCount within line cap", async () => {
    const now = 1_700_000_600_000;
    const entries: StoredResultData[] = [
      {
        id: "s1", type: "search", timestamp: now - 30_000,
        queries: [{ query: "typescript generics", answer: "abcdef", results: [], error: null }],
      },
      {
        id: "f1", type: "fetch", timestamp: now - 60_000,
        urls: [{ url: "https://example.com/page", title: "Example", content: "hello world", error: null }],
      },
      {
        id: "c1", type: "context", timestamp: now - 90_000,
        context: { query: "react hooks", content: "snippet body", error: null },
      },
    ];
    const deps = makeDeps({ listResults: vi.fn(() => entries), now: () => now });
    await dispatch("recent", "", deps);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg).toMatch(/search/);
    expect(msg).toMatch(/fetch/);
    expect(msg).toMatch(/context/);
    expect(msg).toContain("typescript generics");
    expect(msg).toContain("https://example.com/page");
    expect(msg).toContain("react hooks");
    // age formatting (e.g. "30s") and char counts
    expect(msg).toMatch(/30s|1m/);
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected '... Unknown subcommand: "recent" ...' to match /search/` (recent currently hits the unknown branch).

**Step 3 — Write minimal implementation**
Add to `commands.ts`:
```ts
function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function labelFor(entry: StoredResultData): { label: string; chars: number } {
  if (entry.type === "search" && entry.queries) {
    const qs = entry.queries.map((q) => q.query).join(", ");
    const chars = entry.queries.reduce((n, q) => n + (q.answer?.length ?? 0), 0);
    return { label: qs, chars };
  }
  if (entry.type === "fetch" && entry.urls && entry.urls.length > 0) {
    const first = entry.urls[0];
    const chars = entry.urls.reduce((n, u) => n + (u.content?.length ?? 0), 0);
    return { label: first.url, chars };
  }
  if (entry.type === "context" && entry.context) {
    return { label: entry.context.query, chars: entry.context.content?.length ?? 0 };
  }
  return { label: entry.id, chars: 0 };
}

function recentText(entries: StoredResultData[], now: number): string {
  if (entries.length === 0) return "No recent results in this session.";
  const MAX_LINES = 18;
  const lines: string[] = ["Recent session results:"];
  const slice = entries.slice(-MAX_LINES);
  for (const e of slice) {
    const { label, chars } = labelFor(e);
    const age = formatAge(Math.max(0, now - (e.timestamp ?? now)));
    const short = label.length > 60 ? label.slice(0, 57) + "…" : label;
    lines.push(`  [${e.type}] ${short} • ${age} • ${chars} chars`);
  }
  return lines.join("\n");
}
```
And add the recent branch:
```ts
  if (sub === "recent") {
    deps.notify(recentText(deps.listResults(), deps.now()), "info");
    return;
  }
```
Also add the import: `import type { StoredResultData } from "./storage.js";`

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
