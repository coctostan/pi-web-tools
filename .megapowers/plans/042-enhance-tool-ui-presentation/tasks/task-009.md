---
id: 9
title: Add fetch_content expanded per-source rows
status: approved
depends_on:
  - 5
  - 8
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

Covers AC9 (and AC16 fallback). Extends `renderFetchContentResult` so expanded mode lists per-source rows read uniformly from `details.ptcValue.urls` OR `details.ptcValue.sources`, each with a tone marker, title/URL, char count, and error/fallback note. Falls back to content preview when neither array is present.

ptcValue shapes (verified in index.ts): `urls[]` items `{ url, title, content|null, filtered, filePath, charCount|null, error|null }`; `sources[]` items (prompt path) `{ url, title?, answer?, content?, contentLength?, error? }`. Read defensively.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
describe("renderFetchContentResult expanded", () => {
  const render = (details: any) =>
    renderFetchContentResult(
      { content: [{ type: "text", text: "fallback body" }], details },
      { expanded: true, isPartial: false }, t,
    ).render(80);

  it("lists urls[] rows with title, char count, and error marker", () => {
    const out = render({
      successCount: 1, totalCount: 2,
      ptcValue: { urls: [
        { url: "https://a", title: "Alpha", charCount: 1200, error: null },
        { url: "https://b", title: null, charCount: null, error: "timeout" },
      ] },
    }).join("\n");
    expect(out).toContain("Alpha");
    expect(out).toContain("1200");
    expect(out).toContain("https://b");
    expect(out).toContain("timeout");
    expect(out).toContain("\u2713"); // success marker for Alpha
    expect(out).toContain("\u2717"); // error marker for the failed source
  });

  it("reads sources[] when urls[] absent (prompt path)", () => {
    const out = render({
      successCount: 1, totalCount: 1,
      ptcValue: { sources: [{ url: "https://c", title: "Gamma", contentLength: 80 }] },
    }).join("\n");
    expect(out).toContain("Gamma");
    expect(out).toContain("https://c");
  });

  it("falls back to content preview when no urls/sources", () => {
    const out = render({ successCount: 1, totalCount: 1, ptcValue: {} }).join("\n");
    expect(out).toContain("fallback body");
  });

  it("stays width-safe", () => {
    const lines = renderFetchContentResult(
      { content: [{ type: "text", text: "x" }], details: {
        successCount: 1, totalCount: 1,
        ptcValue: { urls: [{ url: "https://" + "y".repeat(200), title: "t".repeat(200), charCount: 5, error: null }] },
      } },
      { expanded: true, isPartial: false }, t,
    ).render(40);
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(40);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `AssertionError: expected '<success>\u2713 fetch...' to contain 'Alpha'` (expanded rows not yet rendered).

**Step 3 — Write minimal implementation**
Replace the `renderFetchContentResult` body in `render-helpers.ts`:
```ts
export function renderFetchContentResult(result: ResultLike, opts: RenderOpts, theme: ThemeLike): Component {
  if (result.isError) return errorView(theme, errorMessageFrom(result));
  if (opts.isPartial) return workingView(theme, "Fetching\u2026");

  const d = result.details ?? {};
  const { success, total } = fetchCounts(d);
  const tone = toneFromCounts(success, total);

  const lines: string[] = [
    statusLine(theme, { tone, label: "fetch", counts: `${success}/${total} fetched` }),
  ];

  if (opts.expanded) {
    const pv = d.ptcValue ?? {};
    const items: any[] = Array.isArray(pv.urls) ? pv.urls : Array.isArray(pv.sources) ? pv.sources : [];
    if (items.length > 0) {
      for (const it of items) {
        const rowTone: Tone = it.error ? "error" : "success";
        const label = it.title ?? it.url ?? "";
        const chars = it.charCount ?? it.contentLength;
        const meta = typeof chars === "number" ? ` (${chars} chars)` : "";
        lines.push(theme.fg(TONE_COLOR[rowTone], `  ${TONE_MARKER[rowTone]} ${label}`) + theme.fg("dim", meta));
        if (it.url && it.url !== label) lines.push(theme.fg("dim", `    ${it.url}`));
        if (it.error) lines.push(theme.fg("error", `    ${it.error}`));
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
