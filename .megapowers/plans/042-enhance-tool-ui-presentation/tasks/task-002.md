---
id: 2
title: Add WidthSafeLines component and truncateLabel width helper
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

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
