---
id: 13
title: Wire all four tools' renderCall/renderResult to shared helpers
status: approved
depends_on:
  - 7
  - 9
  - 10
  - 11
  - 12
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers AC17 (and integrates AC6–AC15). Replaces the ad-hoc `renderCall`/`renderResult` bodies of all four tools in `index.ts` with thin delegators to the Task 1–12 helpers. Executors, `content[].text`, and `ptcValue` are NOT touched. Adds a smoke test proving delegation via the existing harness.

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`

**Step 1 — Write the failing test**
The harness helper `getWebSearchTool()` already exists in `index.test.ts` (returns `{ webSearchTool }`). Append a new describe block at the end of `index.test.ts`:
```ts
describe("web_search renderResult delegates to shared helper", () => {
  it("renders a success status line with marker and counts", async () => {
    const { webSearchTool } = await getWebSearchTool();
    const result = {
      content: [{ type: "text", text: "## Query: x\n..." }],
      details: { successfulQueries: 2, queryCount: 2, totalResults: 5 },
    };
    const comp = webSearchTool.renderResult(result, { expanded: false, isPartial: false }, theme);
    const lines = comp.render(80);
    const text = lines.join("\n");
    // Marker from the shared TONE_MARKER vocabulary, not legacy phrasing.
    expect(text).toContain("\u2713");
    expect(text).toContain("2/2");
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(80);
  });

  it("renderCall returns a width-safe header", async () => {
    const { webSearchTool } = await getWebSearchTool();
    const comp = webSearchTool.renderCall({ query: "z".repeat(200) }, theme);
    for (const l of comp.render(40)) expect(visibleWidth(l)).toBeLessThanOrEqual(40);
  });
});
```
Add this import at the top of `index.test.ts` if not already present (this export is real):
```ts
import { visibleWidth } from "@earendil-works/pi-tui";
```
The pi-coding-agent package root exports the `Theme` class and `type ThemeColor` but NOT a lowercase `theme` instance, so define a stub theme in the test file (place it near the new describe block):
```ts
// Stub theme: returns text unchanged; markers/counts still appear so the
// assertions on "\u2713" / "2/2" and visibleWidth hold.
const theme = { fg: (_c: string, s: string) => s, bold: (s: string) => s } as any;
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "delegates to shared helper"`
Expected: FAIL — assertion error: the current `web_search` renderResult emits the legacy string `"2/2 queries succeeded, 5 sources"` with no `✓` marker, so `expect(text).toContain("\u2713")` fails with `AssertionError: expected '...succeeded...' to contain '✓'`.

**Step 3 — Write minimal implementation**
In `index.ts`:

(a) Add to the imports near the top (after the existing pi-tui import on line 2):
```ts
import {
  renderWebSearchResult,
  renderFetchContentResult,
  renderCodeSearchResult,
  renderGetContentResult,
  renderCallHeader,
} from "./render-helpers.js";
```

(b) Replace the `web_search` `renderCall` body (currently building `"search "` + query/similar) with:
```ts
renderCall(args, theme) {
  const arg = args.similarUrl
    ? `similar: ${args.similarUrl}`
    : args.queries ? args.queries.join(", ") : (args.query || "");
  return renderCallHeader(theme, "search ", arg ? `"${arg}"` : "");
},
```

(c) Replace the entire `web_search` `renderResult(result, { expanded, isPartial }, theme) { ... }` body with:
```ts
renderResult(result, options, theme) {
  return renderWebSearchResult(result as any, options, theme as any);
},
```

(d) Replace the `fetch_content` `renderCall` body with:
```ts
renderCall(args, theme) {
  const arg = args.urls && args.urls.length > 0 ? `${args.urls.length} URLs` : (args.url || "");
  return renderCallHeader(theme, "fetch ", arg);
},
```

(e) Replace the `fetch_content` `renderResult(...) { ... }` body with:
```ts
renderResult(result, options, theme) {
  return renderFetchContentResult(result as any, options, theme as any);
},
```

(f) Replace the `code_search` `renderCall` body with:
```ts
renderCall(args, theme) {
  const q = typeof args.query === "string" ? args.query : "";
  return renderCallHeader(theme, "code_search ", q ? `"${q}"` : "");
},
```

(g) Replace the `code_search` `renderResult(...) { ... }` body with:
```ts
renderResult(result, options, theme) {
  return renderCodeSearchResult(result as any, options, theme as any);
},
```

(h) Replace the `get_search_content` `renderCall` body with:
```ts
renderCall(args, theme) {
  const target = args.query ?? args.url ?? `#${args.queryIndex ?? args.urlIndex ?? ""}`;
  return renderCallHeader(theme, "get_content ", target, 40);
},
```

(i) Replace the `get_search_content` `renderResult(...) { ... }` body with:
```ts
renderResult(result, options, theme) {
  return renderGetContentResult(result as any, options, theme as any);
},
```

Do not modify any `execute(...)` body, any `content:` text, or any `ptcValue` object. Remove the now-unused `Text` import only if no other code references it (the `tool_result` handler on ~line 174 uses plain content objects, not `Text`; verify with a grep for `new Text(` before removing).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "delegates to shared helper"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing (all 198 existing tests plus the new render-helpers and delegation tests).
