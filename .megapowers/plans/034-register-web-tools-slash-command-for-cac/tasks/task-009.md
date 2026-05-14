---
id: 9
title: dispatch("stats") prints stats summary
status: approved
depends_on:
  - 3
  - 6
no_test: false
files_to_modify:
  - commands.ts
  - commands.test.ts
files_to_create: []
---

Covers AC 4.

**Files:**
- Modify: `commands.ts`
- Test: `commands.test.ts`

**Step 1 — Write the failing test**
Append to `commands.test.ts`:
```ts
describe("dispatch(stats)", () => {
  it("prints entries, hits, misses, oldest, newest, sizeBytes, and ttlMinutes", async () => {
    const stats = {
      entries: 3, hits: 7, misses: 2,
      oldest: 1_700_000_000_000, newest: 1_700_000_500_000,
      sizeBytes: 1234, ttlMinutes: 1440,
    };
    const deps = makeDeps({ getCacheStats: vi.fn(() => stats) });
    await dispatch("stats", "", deps);
    expect(deps.getCacheStats).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalled();
    const msg = (deps.notify as any).mock.calls[0][0] as string;
    expect(msg).toMatch(/entries[^\n]*3/i);
    expect(msg).toMatch(/hits[^\n]*7/i);
    expect(msg).toMatch(/miss(es)?[^\n]*2/i);
    expect(msg).toContain("1234"); // sizeBytes
    expect(msg).toContain("1440"); // ttlMinutes
    expect(msg).toContain(new Date(stats.oldest).toISOString());
    expect(msg).toContain(new Date(stats.newest).toISOString());
    expect(msg.split("\n").length).toBeLessThanOrEqual(20);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run commands.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called at least once` for `getCacheStats` (currently stats subcommand falls into the unknown-handler path).

**Step 3 — Write minimal implementation**
In `commands.ts`, add a stats branch before the unknown fallback:
```ts
function formatTs(ts: number | null): string {
  return ts === null ? "—" : new Date(ts).toISOString();
}

function statsText(s: CacheStats): string {
  return [
    "Cache stats:",
    `  entries:     ${s.entries}`,
    `  hits:        ${s.hits}`,
    `  misses:      ${s.misses}`,
    `  oldest:      ${formatTs(s.oldest)}`,
    `  newest:      ${formatTs(s.newest)}`,
    `  sizeBytes:   ${s.sizeBytes}`,
    `  ttlMinutes:  ${s.ttlMinutes}`,
  ].join("\n");
}

export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "" || sub === "help") { deps.notify(helpText(), "info"); return; }
  if (sub === "stats") { deps.notify(statsText(deps.getCacheStats()), "info"); return; }
  deps.notify(`Unknown subcommand: "${sub}". Try /web-tools help.\n\n${helpText()}`, "warning");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run commands.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
