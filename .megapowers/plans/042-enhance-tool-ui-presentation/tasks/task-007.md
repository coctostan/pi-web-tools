---
id: 7
title: Add web_search expanded per-query rows
status: approved
depends_on:
  - 5
  - 6
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

Covers AC7 (and AC16 fallback for this tool). Extends `renderWebSearchResult` so that when `opts.expanded` is true it appends per-query rows from `details.ptcValue.queries`, each showing query text, result count, and error if present. Falls back to a content preview when `ptcValue.queries` is missing.

`ptcValue.queries` items are shaped `{ query: string, results: Array<{title,url,snippet}>, error: string | null }` (verified in index.ts ~lines 362–366).

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
describe("renderWebSearchResult expanded", () => {
  const render = (details: any) =>
    renderWebSearchResult(
      { content: [{ type: "text", text: "fallback body text" }], details },
      { expanded: true, isPartial: false },
      t,
    ).render(80);

  it("lists one row per query with result counts", () => {
    const out = render({
      successfulQueries: 2,
      queryCount: 2,
      totalResults: 3,
      ptcValue: {
        queries: [
          { query: "react hooks", results: [{}, {}], error: null },
          { query: "vue setup", results: [{}], error: null },
        ],
      },
    }).join("\n");
    expect(out).toContain("react hooks");
    expect(out).toContain("2 results");
    expect(out).toContain("vue setup");
    expect(out).toContain("1 results");
  });

  it("shows the error text for a failed query", () => {
    const out = render({
      successfulQueries: 0,
      queryCount: 1,
      totalResults: 0,
      ptcValue: { queries: [{ query: "boom", results: [], error: "rate limited" }] },
    }).join("\n");
    expect(out).toContain("boom");
    expect(out).toContain("rate limited");
  });

  it("falls back to content preview when ptcValue.queries is missing", () => {
    const out = render({ successfulQueries: 1, queryCount: 1, totalResults: 1 }).join("\n");
    expect(out).toContain("fallback body text");
  });

  it("stays width-safe in expanded mode", () => {
    const lines = renderWebSearchResult(
      { content: [{ type: "text", text: "x" }], details: {
        successfulQueries: 1, queryCount: 1, totalResults: 1,
        ptcValue: { queries: [{ query: "q".repeat(200), results: [{}], error: null }] },
      } },
      { expanded: true, isPartial: false },
      t,
    ).render(40);
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(40);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `AssertionError: expected '<success>✓ search 2/2 queries, 3 sources' to contain 'react hooks'` (`out` is the collapsed status-line string; expanded rows are not yet rendered).

**Step 3 — Write minimal implementation**
Replace the `renderWebSearchResult` body in `render-helpers.ts` so the final return assembles collapsed + expanded lines:
```ts
export function renderWebSearchResult(result: ResultLike, opts: RenderOpts, theme: ThemeLike): Component {
  if (result.isError) return errorView(theme, errorMessageFrom(result));
  if (opts.isPartial) return workingView(theme, "Searching\u2026");

  const d = result.details ?? {};
  const success = Number(d.successfulQueries ?? 0);
  const total = Number(d.queryCount ?? 0);
  const sources = Number(d.totalResults ?? 0);
  const tone = toneFromCounts(success, total);

  const lines: string[] = [
    statusLine(theme, { tone, label: "search", counts: `${success}/${total} queries, ${sources} sources` }),
  ];

  if (opts.expanded) {
    const queries = d.ptcValue?.queries;
    if (Array.isArray(queries) && queries.length > 0) {
      for (const q of queries) {
        const rowTone: Tone = q.error ? "error" : "success";
        const count = Array.isArray(q.results) ? q.results.length : 0;
        lines.push(theme.fg(TONE_COLOR[rowTone], `  ${TONE_MARKER[rowTone]} ${q.query ?? ""}`) + theme.fg("dim", ` (${count} results)`));
        if (q.error) lines.push(theme.fg("error", `    ${q.error}`));
      }
    } else {
      lines.push(...previewFallbackLines(theme, errorMessageFrom(result)));
    }
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
