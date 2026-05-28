---
id: 1
title: Create render-helpers module with tone vocabulary and statusLine
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - render-helpers.ts
  - render-helpers.test.ts
---

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
