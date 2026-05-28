---
id: 5
title: Add previewFallbackLines helper for content-text fallback
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - render-helpers.ts
  - render-helpers.test.ts
files_to_create: []
---

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
