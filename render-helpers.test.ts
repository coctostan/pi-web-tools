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