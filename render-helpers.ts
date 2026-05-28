import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";

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

/** Consistent error rendering: error-role message, width-safe. */
export function errorView(theme: ThemeLike, message: string): Component {
  return new WidthSafeLines([theme.fg("error", message)]);
}

/** Consistent in-progress indicator: warning-role label, width-safe. */
export function workingView(theme: ThemeLike, label: string): Component {
  return new WidthSafeLines([theme.fg("warning", label)]);
}

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
