---
id: 6
title: Add renderWebSearchResult collapsed status line
status: approved
depends_on:
  - 3
  - 4
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

Covers AC6 (and AC13/AC14 for this tool). Pure function rendering web_search's result; collapsed-only here, expanded added in Task 7. Tone derived from success/total counts in `details`.

The web_search executor returns `details` shaped: `{ queryCount, successfulQueries, totalResults, responseId, ptcValue: { queries: [{query, results, error}], queryCount, successfulQueries, totalResults } }` (verified in index.ts execute, ~lines 355–372).

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { renderWebSearchResult } from "./render-helpers.js";

const t = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `**${text}**`,
} as any;

describe("renderWebSearchResult collapsed", () => {
  const mk = (details: any, opts: any = {}) =>
    renderWebSearchResult(
      { content: [{ type: "text", text: "body" }], details },
      { expanded: false, isPartial: false, ...opts },
      t,
    ).render(80).join("\n");

  it("success tone when all queries succeed", () => {
    const out = mk({ successfulQueries: 2, queryCount: 2, totalResults: 7 });
    expect(out).toContain("<success>");
    expect(out).toContain("\u2713");
    expect(out).toContain("2/2");
    expect(out).toContain("7 sources");
  });

  it("partial tone when some queries fail", () => {
    const out = mk({ successfulQueries: 1, queryCount: 2, totalResults: 3 });
    expect(out).toContain("<warning>");
    expect(out).toContain("!");
  });

  it("error tone when all queries fail", () => {
    const out = mk({ successfulQueries: 0, queryCount: 2, totalResults: 0 });
    expect(out).toContain("<error>");
    expect(out).toContain("\u2717");
  });

  it("renders error view when result.isError", () => {
    const out = renderWebSearchResult(
      { content: [{ type: "text", text: "bad" }], details: {}, isError: true },
      { expanded: false, isPartial: false },
      t,
    ).render(80).join("\n");
    expect(out).toContain("<error>");
    expect(out).toContain("bad");
  });

  it("renders working view when isPartial", () => {
    const out = renderWebSearchResult(
      { content: [], details: {} },
      { expanded: false, isPartial: true },
      t,
    ).render(80).join("\n");
    expect(out).toContain("<warning>");
    expect(out).toContain("Searching");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'renderWebSearchResult'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
export interface ResultLike {
  content: Array<{ type: string; text?: string }>;
  details?: any;
  isError?: boolean;
}

export interface RenderOpts {
  expanded: boolean;
  isPartial: boolean;
}

export function errorMessageFrom(result: ResultLike): string {
  const c = result.content?.[0];
  return c && c.type === "text" && c.text ? c.text : "Error";
}

/** success when all (or zero expected) succeeded, error when none, else partial. */
export function toneFromCounts(success: number, total: number): Tone {
  if (total <= 0) return "success";
  if (success >= total) return "success";
  return success === 0 ? "error" : "partial";
}

export function renderWebSearchResult(result: ResultLike, opts: RenderOpts, theme: ThemeLike): Component {
  if (result.isError) return errorView(theme, errorMessageFrom(result));
  if (opts.isPartial) return workingView(theme, "Searching\u2026");

  const d = result.details ?? {};
  const success = Number(d.successfulQueries ?? 0);
  const total = Number(d.queryCount ?? 0);
  const sources = Number(d.totalResults ?? 0);
  const tone = toneFromCounts(success, total);

  const line = statusLine(theme, {
    tone,
    label: "search",
    counts: `${success}/${total} queries, ${sources} sources`,
  });
  return new WidthSafeLines([line]);
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
