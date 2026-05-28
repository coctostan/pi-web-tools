---
id: 3
title: Add errorView helper for consistent error rendering
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

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
