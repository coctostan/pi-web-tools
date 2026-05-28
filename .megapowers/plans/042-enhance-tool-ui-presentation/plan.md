# Plan

### Task 1: Create render-helpers module with tone vocabulary and statusLine

Covers AC1, AC2, AC3. Creates the shared module's status-line builder and tone→color / tone→marker maps.

**Files:**
- Create: `render-helpers.ts`
- Test: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Create `render-helpers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { statusLine, TONE_COLOR, TONE_MARKER } from "./render-helpers.js";

// Stub theme: wraps text in role tags so tests can assert which fg role was used.
const theme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `**${text}**`,
} as any;

describe("tone maps", () => {
  it("maps tone to theme fg role", () => {
    expect(TONE_COLOR.success).toBe("success");
    expect(TONE_COLOR.partial).toBe("warning");
    expect(TONE_COLOR.error).toBe("error");
  });

  it("selects single-width markers, not emoji", () => {
    expect(TONE_MARKER.success).toBe("\u2713"); // ✓
    expect(TONE_MARKER.partial).toBe("!");
    expect(TONE_MARKER.error).toBe("\u2717"); // ✗
  });
});

describe("statusLine", () => {
  it("renders marker + label in the tone color and counts in dim", () => {
    const s = statusLine(theme, { tone: "success", label: "search", counts: "2/2 queries" });
    expect(s).toContain("<success>");
    expect(s).toContain("\u2713");
    expect(s).toContain("search");
    expect(s).toContain("<dim>");
    expect(s).toContain("2/2 queries");
  });

  it("uses warning role for partial tone", () => {
    const s = statusLine(theme, { tone: "partial", label: "fetch" });
    expect(s).toContain("<warning>");
    expect(s).toContain("!");
  });

  it("never emits model-facing emoji glyphs", () => {
    const s = statusLine(theme, { tone: "error", label: "x" });
    expect(s).not.toContain("\u2705"); // ✅
    expect(s).not.toContain("\u26a0"); // ⚠
    expect(s).not.toContain("\u274c"); // ❌
    expect(s).toContain("\u2717"); // ✗
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./render-helpers.js" from "render-helpers.test.ts". Does the file exist?`

**Step 3 — Write minimal implementation**
Create `render-helpers.ts`:
```ts
import type { ThemeColor } from "@earendil-works/pi-coding-agent";

/** Minimal structural view of the parts of Theme the helpers use. */
export interface ThemeLike {
  fg(color: ThemeColor, text: string): string;
  bold(text: string): string;
}

export type Tone = "success" | "partial" | "error";

/** Tone -> theme fg role. */
export const TONE_COLOR: Record<Tone, ThemeColor> = {
  success: "success",
  partial: "warning",
  error: "error",
};

/** Tone -> single-width status marker (never model-facing emoji). */
export const TONE_MARKER: Record<Tone, string> = {
  success: "\u2713", // ✓
  partial: "!",
  error: "\u2717", // ✗
};

export interface StatusLineOptions {
  tone: Tone;
  label: string;
  counts?: string;
  marker?: string;
}

/** Build a themed single-line status string: "[marker] [label] [counts]". */
export function statusLine(theme: ThemeLike, opts: StatusLineOptions): string {
  const marker = opts.marker ?? TONE_MARKER[opts.tone];
  const color = TONE_COLOR[opts.tone];
  let s = theme.fg(color, `${marker} ${opts.label}`);
  if (opts.counts) {
    s += theme.fg("dim", ` ${opts.counts}`);
  }
  return s;
}
```

If `@earendil-works/pi-coding-agent` does not re-export `ThemeColor` at the package root, replace the import line with `type ThemeColor = string;` (the helpers only pass role names through to `theme.fg`).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 2: Add WidthSafeLines component and truncateLabel width helper [depends: 1]

Covers AC4, AC5, AC8. Adds the width-aware row component every renderer returns, plus `truncateLabel` for renderCall args. Width is only known at `render(width)`, so line truncation happens there using `truncateToWidth` (not `.slice()`). `truncateLabel` is a fixed-budget helper for the call-header argument.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { WidthSafeLines, truncateLabel } from "./render-helpers.js";
import { visibleWidth } from "@earendil-works/pi-tui";

describe("WidthSafeLines", () => {
  it("never emits a rendered line wider than width (ANSI + wide chars)", () => {
    const lines = [
      "\u001b[31m" + "x".repeat(120) + "\u001b[0m", // ANSI-wrapped long line
      "\u77ed".repeat(60),                            // wide CJK chars
      "short",
    ];
    const comp = new WidthSafeLines(lines);
    for (const w of [5, 10, 40, 80]) {
      for (const line of comp.render(w)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(w);
      }
    }
  });

  it("returns one rendered line per input line", () => {
    const comp = new WidthSafeLines(["a", "b", "c"]);
    expect(comp.render(80)).toHaveLength(3);
  });

  it("implements the Component interface (render + invalidate)", () => {
    const comp = new WidthSafeLines(["a"]);
    expect(typeof comp.render).toBe("function");
    expect(typeof comp.invalidate).toBe("function");
    expect(() => comp.invalidate()).not.toThrow();
  });
});

describe("truncateLabel", () => {
  it("truncates to a fixed visible budget with ellipsis", () => {
    const out = truncateLabel("x".repeat(100), 40);
    expect(visibleWidth(out)).toBeLessThanOrEqual(40);
  });

  it("leaves short text unchanged", () => {
    expect(truncateLabel("short", 60)).toBe("short");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'WidthSafeLines'`

**Step 3 — Write minimal implementation**
Add to the imports at the top of `render-helpers.ts`:
```ts
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
```
Append to `render-helpers.ts`:
```ts
/**
 * Component holding pre-themed lines. Each line is truncated to the render
 * width with `truncateToWidth` (ANSI-aware), guaranteeing visibleWidth <= width.
 * Stateless per render so theme changes propagate (fresh instance each render call).
 */
export class WidthSafeLines implements Component {
  constructor(private readonly lines: string[]) {}

  invalidate(): void {
    // No cached state; nothing to clear.
  }

  render(width: number): string[] {
    const w = Math.max(0, width);
    return this.lines.map((line) => truncateToWidth(line, w, "\u2026"));
  }
}

/** Truncate an UNTHEMED label to a fixed visible budget (for call headers). */
export function truncateLabel(text: string, maxWidth: number): string {
  return truncateToWidth(text, maxWidth, "\u2026");
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 3: Add errorView helper for consistent error rendering [depends: 2]

Covers AC13. A single consistent error path: themed `error` role, width-safe.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { errorView } from "./render-helpers.js";

const theme2 = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `**${text}**`,
} as any;

describe("errorView", () => {
  it("renders the message in the error role", () => {
    const comp = errorView(theme2, "boom");
    const out = comp.render(80);
    expect(out.join("\n")).toContain("<error>");
    expect(out.join("\n")).toContain("boom");
  });

  it("is width-safe for long messages", () => {
    const comp = errorView(theme2, "e".repeat(200));
    for (const line of comp.render(40)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'errorView'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
/** Consistent error rendering: error-role message, width-safe. */
export function errorView(theme: ThemeLike, message: string): Component {
  return new WidthSafeLines([theme.fg("error", message)]);
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 4: Add workingView helper for consistent in-progress rendering [depends: 2]

Covers AC14. Consistent themed "working" indicator for isPartial, using the `warning` role.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { workingView } from "./render-helpers.js";

const theme3 = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `**${text}**`,
} as any;

describe("workingView", () => {
  it("renders the label in the warning role", () => {
    const comp = workingView(theme3, "Searching\u2026");
    const out = comp.render(80).join("\n");
    expect(out).toContain("<warning>");
    expect(out).toContain("Searching");
  });

  it("is width-safe", () => {
    const comp = workingView(theme3, "w".repeat(200));
    for (const line of comp.render(30)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(30);
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'workingView'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
/** Consistent in-progress indicator: warning-role label, width-safe. */
export function workingView(theme: ThemeLike, label: string): Component {
  return new WidthSafeLines([theme.fg("warning", label)]);
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 5: Add previewFallbackLines helper for content-text fallback [depends: 1]

Covers AC16. Produces a bounded preview (array of dim-themed lines) from a tool's `content[0].text` when structured per-item data is missing. WidthSafeLines (Task 2) handles per-line width truncation; this helper only bounds the number of lines.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { previewFallbackLines } from "./render-helpers.js";

const theme4 = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `**${text}**`,
} as any;

describe("previewFallbackLines", () => {
  it("returns dim-themed lines bounded by maxLines", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line${i}`).join("\n");
    const lines = previewFallbackLines(theme4, text, 8);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines[0]).toContain("<dim>");
    expect(lines[0]).toContain("line0");
  });

  it("returns an empty array for empty/whitespace text", () => {
    expect(previewFallbackLines(theme4, "   ", 8)).toEqual([]);
    expect(previewFallbackLines(theme4, "", 8)).toEqual([]);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'previewFallbackLines'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
/**
 * Bounded, dim-themed preview of raw content text, used as a fallback when
 * structured per-item details are unavailable. Per-line width truncation is
 * handled later by WidthSafeLines; this only caps the number of lines.
 */
export function previewFallbackLines(theme: ThemeLike, text: string, maxLines = 8): string[] {
  if (!text || text.trim().length === 0) return [];
  return text
    .split("\n")
    .slice(0, maxLines)
    .map((line) => theme.fg("dim", line));
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 6: Add renderWebSearchResult collapsed status line [depends: 3, 4]

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

### Task 7: Add web_search expanded per-query rows [depends: 5, 6]

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

### Task 8: Add renderFetchContentResult collapsed status line [depends: 3, 4, 6]

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

### Task 9: Add fetch_content expanded per-source rows [depends: 5, 8]

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

### Task 10: Add renderCodeSearchResult collapsed and expanded view [depends: 3, 4, 5, 6]

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

### Task 11: Add renderGetContentResult with error-aware tone [depends: 3, 4, 5, 6]

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

### Task 12: Add renderCallHeader helper for consistent call headers [depends: 2]

Covers AC15. Shared builder for `renderCall`: bold `toolTitle` + accent-colored primary argument, sharing `truncateLabel` for the argument. Returns a Component.

**Files:**
- Modify: `render-helpers.ts`
- Modify: `render-helpers.test.ts`

**Step 1 — Write the failing test**
Append to `render-helpers.test.ts`:
```ts
import { renderCallHeader } from "./render-helpers.js";

describe("renderCallHeader", () => {
  it("renders bold toolTitle and accent arg", () => {
    const out = renderCallHeader(t, "search ", '"react hooks"').render(80).join("\n");
    expect(out).toContain("<toolTitle>");
    expect(out).toContain("**"); // bold applied
    expect(out).toContain("<accent>");
    expect(out).toContain("react hooks");
  });

  it("truncates a long argument and stays width-safe", () => {
    const comp = renderCallHeader(t, "fetch ", "https://" + "a".repeat(300));
    for (const l of comp.render(50)) {
      expect(visibleWidth(l)).toBeLessThanOrEqual(50);
    }
  });

  it("renders title only when arg is empty", () => {
    const out = renderCallHeader(t, "code_search ", "").render(80).join("\n");
    expect(out).toContain("code_search");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run render-helpers.test.ts`
Expected: FAIL — `SyntaxError: The requested module './render-helpers.js' does not provide an export named 'renderCallHeader'`

**Step 3 — Write minimal implementation**
Append to `render-helpers.ts`:
```ts
/**
 * Consistent call header: bold toolTitle + accent-colored primary argument.
 * The argument is truncated to a fixed budget; final width-safety is enforced
 * by WidthSafeLines at render time.
 */
export function renderCallHeader(theme: ThemeLike, title: string, arg: string, argBudget = 60): Component {
  let text = theme.fg("toolTitle", theme.bold(title));
  if (arg && arg.length > 0) {
    text += theme.fg("accent", truncateLabel(arg, argBudget));
  }
  return new WidthSafeLines([text]);
}
```
Note: `truncateLabel` and `WidthSafeLines` are already defined (Task 2); `ThemeLike`/`Component` already imported.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run render-helpers.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 13: Wire all four tools' renderCall/renderResult to shared helpers [depends: 7, 9, 10, 11, 12]

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
