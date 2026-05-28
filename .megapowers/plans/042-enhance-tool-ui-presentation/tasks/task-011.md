---
id: 11
title: Add renderGetContentResult with error-aware tone
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

Covers AC12 (and AC13/AC14 for this tool). Pure function. Fixes the current bug where get_search_content always renders `success` even for error-detail results. Tone: error when `result.isError` OR `details.error` present; else success. Expanded shows a content preview consistent with other tools.

get_search_content `details` variants (verified in index.ts ~lines 1015–1121): search/all → `{ type:"search", queryCount }`; single query → `{ type:"search", query, resultCount }`; fetch error → `{ type:"fetch", url, error }`; fetch single → `{ type:"fetch", url, title, charCount }`; fetch all → `{ type:"fetch", urlCount }`; context → `{ type:"context", query, charCount }`.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { renderGetContentResult } from "./render-helpers.js";

describe("renderGetContentResult", () => {
  const mk = (details: any, opts: any = {}, isError = false) =>
    renderGetContentResult(
      { content: [{ type: "text", text: "stored body" }], details, isError },
      { expanded: false, isPartial: false, ...opts }, t,
    ).render(80).join("\n");

  it("success tone with query label and result count", () => {
    const out = mk({ type: "search", query: "hooks", resultCount: 4 });
    expect(out).toContain("<success>");
    expect(out).toContain("hooks");
    expect(out).toContain("4 results");
  });

  it("error tone when details.error is present (the bug being fixed)", () => {
    const out = mk({ type: "fetch", url: "https://x", error: "expired" });
    expect(out).toContain("<error>");
    expect(out).toContain("expired");
  });

  it("error tone when result.isError", () => {
    const out = mk({}, {}, true);
    expect(out).toContain("<error>");
  });

  it("working view when isPartial", () => {
    const out = mk({}, { isPartial: true });
    expect(out).toContain("<warning>");
  });

  it("fetch single shows title and char count", () => {
    const out = mk({ type: "fetch", url: "https://x", title: "Doc", charCount: 300 });
    expect(out).toContain("Doc");
    expect(out).toContain("300 chars");
  });

  it("expanded shows content preview", () => {
    const out = renderGetContentResult(
      { content: [{ type: "text", text: "preview text body" }], details: { type: "search", queryCount: 2 } },
      { expanded: true, isPartial: false }, t,
    ).render(80).join("\n");
    expect(out).toContain("preview text body");
  });

  it("expanded stays width-safe", () => {
    const lines = renderGetContentResult(
      { content: [{ type: "text", text: "z".repeat(400) }], details: { type: "context", query: "q", charCount: 9 } },
      { expanded: true, isPartial: false }, t,
    ).render(40);
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(40);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'renderGetContentResult'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
export function renderGetContentResult(result: ResultLike, opts: RenderOpts, theme: ThemeLike): Component {
  const d = result.details ?? {};
  if (result.isError || d.error) {
    return errorView(theme, d.error ? String(d.error) : errorMessageFrom(result));
  }
  if (opts.isPartial) return workingView(theme, "Retrieving\u2026");

  let label = "content";
  let counts: string | undefined;
  if (d.query) {
    label = String(d.query);
    if (typeof d.resultCount === "number") counts = `${d.resultCount} results`;
    else if (typeof d.charCount === "number") counts = `${d.charCount} chars`;
  } else if (d.title) {
    label = String(d.title);
    if (typeof d.charCount === "number") counts = `${d.charCount} chars`;
  } else if (typeof d.urlCount === "number") {
    label = `${d.urlCount} URLs`;
  } else if (typeof d.queryCount === "number") {
    label = `${d.queryCount} queries`;
  }

  const lines: string[] = [statusLine(theme, { tone: "success", label, counts })];

  if (opts.expanded) {
    lines.push(...previewFallbackLines(theme, errorMessageFrom(result)));
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
