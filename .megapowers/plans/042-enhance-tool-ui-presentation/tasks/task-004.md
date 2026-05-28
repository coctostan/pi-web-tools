---
id: 4
title: Add workingView helper for consistent in-progress rendering
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

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
