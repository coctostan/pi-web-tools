---
id: 8
title: Add renderFetchContentResult collapsed status line
status: approved
depends_on:
  - 3
  - 4
  - 6
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

Covers AC8 (and AC13/AC14 for this tool). Pure function; collapsed-only here, expanded added in Task 9. Tone from `details.successCount`/`details.totalCount`; single-URL paths lack those counts so derive 1/1 (success) or 0/1 (error) from presence of `details.error`.

fetch_content `details` shapes (verified in index.ts execute): multi-URL → `{ responseId, successCount, totalCount, ptcValue }`; single-URL success → `{ responseId, url, title, charCount, ... }` (no successCount); single-URL error → `{ responseId, url, error, ptcValue }`.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { renderFetchContentResult } from "./render-helpers.js";

describe("renderFetchContentResult collapsed", () => {
  const mk = (details: any, opts: any = {}) =>
    renderFetchContentResult(
      { content: [{ type: "text", text: "body" }], details },
      { expanded: false, isPartial: false, ...opts },
      t,
    ).render(80).join("\n");

  it("multi-URL all success -> success tone with counts", () => {
    const out = mk({ successCount: 3, totalCount: 3 });
    expect(out).toContain("<success>");
    expect(out).toContain("3/3");
  });

  it("multi-URL some failed -> partial tone", () => {
    const out = mk({ successCount: 2, totalCount: 3 });
    expect(out).toContain("<warning>");
  });

  it("single-URL success (no counts) -> success tone 1/1", () => {
    const out = mk({ url: "https://x", title: "Doc", charCount: 100 });
    expect(out).toContain("<success>");
    expect(out).toContain("1/1");
  });

  it("single-URL error -> error tone 0/1", () => {
    const out = mk({ url: "https://x", error: "timeout" });
    expect(out).toContain("<error>");
    expect(out).toContain("0/1");
  });

  it("renders error view when result.isError", () => {
    const out = renderFetchContentResult(
      { content: [{ type: "text", text: "bad" }], details: {}, isError: true },
      { expanded: false, isPartial: false }, t,
    ).render(80).join("\n");
    expect(out).toContain("<error>");
    expect(out).toContain("bad");
  });

  it("renders working view when isPartial", () => {
    const out = renderFetchContentResult(
      { content: [], details: {} }, { expanded: false, isPartial: true }, t,
    ).render(80).join("\n");
    expect(out).toContain("<warning>");
    expect(out).toContain("Fetching");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'renderFetchContentResult'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
function fetchCounts(d: any): { success: number; total: number } {
  if (typeof d.totalCount === "number") {
    return { success: Number(d.successCount ?? 0), total: Number(d.totalCount) };
  }
  // Single-URL path: success unless an error is present.
  return d.error ? { success: 0, total: 1 } : { success: 1, total: 1 };
}

export function renderFetchContentResult(result: ResultLike, opts: RenderOpts, theme: ThemeLike): Component {
  if (result.isError) return errorView(theme, errorMessageFrom(result));
  if (opts.isPartial) return workingView(theme, "Fetching\u2026");

  const d = result.details ?? {};
  const { success, total } = fetchCounts(d);
  const tone = toneFromCounts(success, total);

  const line = statusLine(theme, { tone, label: "fetch", counts: `${success}/${total} fetched` });
  return new WidthSafeLines([line]);
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
