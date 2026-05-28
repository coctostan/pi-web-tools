---
id: 12
title: Add renderCallHeader helper for consistent call headers
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

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
