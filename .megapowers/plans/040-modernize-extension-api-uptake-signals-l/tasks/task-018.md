---
id: 18
title: Snapshot the result store to disk on every storeResult call site
status: approved
depends_on:
  - 17
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

After each `storeResult(...)` + `pi.appendEntry(...)` pair in `index.ts` (three sites: `web_search`, `fetch_content`, `code_search`), also write the current store snapshot to the per-session disk file. (AC-COMPACT-2)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
import { mkdtempSync as _mkdtempCompact, rmSync as _rmSyncCompact, existsSync as _existsCompact } from "node:fs";
import { tmpdir as _tmpdirCompact } from "node:os";
import { join as _joinCompact } from "node:path";

describe("storeResult disk snapshot (#032 AC-COMPACT-2)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("writes a snapshot to results-<sessionId>.json after web_search storeResult", async () => {
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-snap-"));
    const { webSearchTool } = await getWebSearchTool();
    exaState.searchExa.mockResolvedValueOnce([]);
    exaState.formatSearchResults.mockReturnValueOnce("");

    await webSearchTool.execute(
      "call-snap-web",
      { queries: ["q"], numResults: 5, type: undefined, category: undefined, includeDomains: undefined, excludeDomains: undefined, detail: undefined, maxAgeHours: undefined, similarUrl: undefined },
      new AbortController().signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "snap-web" }, webToolsResultsDir: dir } as any,
    );

    expect(_existsCompact(_joinCompact(dir, "results-snap-web.json"))).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });

  it("writes a snapshot to results-<sessionId>.json after fetch_content storeResult", async () => {
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-snap-"));
    const { fetchContentTool } = await getFetchContentTool();
    state.extractContent.mockResolvedValueOnce({ url: "https://example.com", title: "T", content: "C", error: null });

    await fetchContentTool.execute(
      "call-snap-fetch",
      { urls: ["https://example.com"], forceClone: undefined, prompt: undefined, noCache: true },
      new AbortController().signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "snap-fetch" }, modelRegistry: {}, webToolsResultsDir: dir } as any,
    );

    expect(_existsCompact(_joinCompact(dir, "results-snap-fetch.json"))).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });

  it("writes a snapshot to results-<sessionId>.json after code_search storeResult", async () => {
    const dir = _mkdtempCompact(_joinCompact(_tmpdirCompact(), "web-tools-snap-"));
    const { codeSearchTool } = await getCodeSearchTool();
    exaContextState.searchContext.mockResolvedValueOnce({ query: "useState", content: "context" });

    await codeSearchTool.execute(
      "call-snap-code",
      { query: "useState", tokensNum: undefined },
      new AbortController().signal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "snap-code" }, webToolsResultsDir: dir } as any,
    );

    expect(_existsCompact(_joinCompact(dir, "results-snap-code.json"))).toBe(true);
    _rmSyncCompact(dir, { recursive: true, force: true });
  });
});
```

(Note: the `ctx.webToolsResultsDir` field is a test-only override the implementation honors so we don't pollute `~/.pi/cache/web-tools/` during tests. The production code reads it as `ctx.webToolsResultsDir ?? DEFAULT_RESULTS_DIR`.)

**Step 2 — Run tests, verify they fail**
Run: `npx vitest run index.test.ts -t "writes a snapshot to results-<sessionId>.json"`
Expected: FAIL — the first failing case reports `expect(_existsCompact(_joinCompact(dir, "results-snap-web.json"))).toBe(true)` received false because no store-result call site writes `results-<sessionId>.json` yet.

**Step 3 — Write minimal implementation**

In `index.ts`, add imports:

```ts
import { writeStoreSnapshot, resultsFilePath, DEFAULT_RESULTS_DIR } from "./session-results-store.js";
import { getAllResults } from "./storage.js"; // already imported — verify
```

Define a small helper at module scope:

```ts
function snapshotStore(ctx: ExtensionContext): void {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId) return;
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  writeStoreSnapshot(resultsFilePath(sessionId, dir), getAllResults());
}
```

At each of the three `storeResult(searchId, storedData); pi.appendEntry("web-tools-results", storedData);` sites (currently lines 335–336 for `web_search`, 507–508 for `fetch_content`, 880–881 for `code_search`), append a call:

```ts
storeResult(responseId, storedData);
pi.appendEntry("web-tools-results", storedData);
snapshotStore(ctx);
```

For `web_search`, `_ctx` is currently named `_ctx` — rename to `ctx` so it's used.
For `code_search`, same rename: `_ctx` -> `ctx`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "writes a snapshot to results-<sessionId>.json"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
