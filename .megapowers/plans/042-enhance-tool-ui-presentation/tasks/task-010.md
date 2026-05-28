---
id: 10
title: Add renderCodeSearchResult collapsed and expanded view
status: approved
depends_on:
  - 3
  - 4
  - 5
  - 6
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

Covers AC10, AC11 (and AC13/AC14 for this tool). Pure function. code_search is single-shot: success tone for non-error, error tone for error. Expanded shows query label, char count, and truncation indicator.

code_search `details` (verified in index.ts ~lines 883–895): success → `{ responseId, query, charCount, truncated, ptcValue }`; error → `{ query, error, ptcValue }` with `isError: true`.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { renderCodeSearchResult } from "./render-helpers.js";

describe("renderCodeSearchResult", () => {
  const mk = (details: any, opts: any = {}, isError = false) =>
    renderCodeSearchResult(
      { content: [{ type: "text", text: "code body here" }], details, isError },
      { expanded: false, isPartial: false, ...opts }, t,
    ).render(80).join("\n");

  it("success tone with query label and char count", () => {
    const out = mk({ query: "merge sort", charCount: 540, truncated: false });
    expect(out).toContain("<success>");
    expect(out).toContain("merge sort");
    expect(out).toContain("540 chars");
  });

  it("error tone when result.isError", () => {
    const out = mk({ query: "x", error: "no key" }, {}, true);
    expect(out).toContain("<error>");
    expect(out).toContain("no key");
  });

  it("working view when isPartial", () => {
    const out = mk({}, { isPartial: true });
    expect(out).toContain("<warning>");
    expect(out).toContain("Searching code");
  });

  it("expanded shows truncation indicator when truncated", () => {
    const out = renderCodeSearchResult(
      { content: [{ type: "text", text: "b" }], details: { query: "q", charCount: 99, truncated: true } },
      { expanded: true, isPartial: false }, t,
    ).render(80).join("\n");
    expect(out.toLowerCase()).toContain("truncat");
  });

  it("expanded stays width-safe", () => {
    const lines = renderCodeSearchResult(
      { content: [{ type: "text", text: "b" }], details: { query: "q".repeat(200), charCount: 99, truncated: true } },
      { expanded: true, isPartial: false }, t,
    ).render(40);
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(40);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'renderCodeSearchResult'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
export function renderCodeSearchResult(result: ResultLike, opts: RenderOpts, theme: ThemeLike): Component {
  const d = result.details ?? {};
  if (result.isError || d.error) {
    return errorView(theme, d.error ? String(d.error) : errorMessageFrom(result));
  }
  if (opts.isPartial) return workingView(theme, "Searching code\u2026");

  const query = d.query ?? "code_search";
  const chars = typeof d.charCount === "number" ? `${d.charCount} chars` : undefined;

  const lines: string[] = [
    statusLine(theme, { tone: "success", label: query, counts: chars }),
  ];

  if (opts.expanded) {
    if (d.truncated) lines.push(theme.fg("warning", "  [truncated]"));
  }

  return new WidthSafeLines(lines);
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
