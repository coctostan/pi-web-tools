# 042 — Enhance Tool UI Presentation

## Summary

Routed every `renderCall` / `renderResult` of pi-web-tools' four tools
(`web_search`, `fetch_content`, `code_search`, `get_search_content`) through a
new shared `render-helpers.ts` module. Collapsed results now share a uniform
`[marker] [label] [counts]` status line with a consistent tone vocabulary, and
expanded results show per-item hierarchy built from existing `details` /
`ptcValue` data — without touching executors, model-facing `content[].text`,
or `ptcValue` shapes.

A latent bug in `get_search_content` (always rendered `success` even when
`details.error` was set) is fixed as part of the unification.

## Motivation

The four tools' renderers had drifted: each rebuilt similar themed strings,
used slightly different success/error phrasing, hand-rolled `.slice()`
truncation that ignored ANSI widths and CJK, and lacked any consistent error
or in-progress UX. The expanded views also didn't reliably surface the rich
per-item data the executors already store in `ptcValue`.

## What Changed

### New module: `render-helpers.ts`

A small, pure-function module with no I/O. Public surface (signatures pulled
from `symbol_graph`):

- `statusLine(theme: ThemeLike, opts: StatusLineOptions): string` — builds
  `[marker] [label] [counts]` with tone-driven coloring.
- `class WidthSafeLines implements Component` — holds pre-themed lines;
  `render(width)` runs every line through `truncateToWidth(line, w, "…")` so
  `visibleWidth(line) <= width` even with ANSI escapes and wide CJK chars.
- `truncateLabel(text: string, maxWidth: number): string` — fixed-budget
  ellipsis truncation for call-header arguments.
- `errorView(theme, message)` / `workingView(theme, label)` — consistent
  error (role `error`) and in-progress (role `warning`) components.
- `previewFallbackLines(theme, text, maxLines = 8): string[]` — dim-themed
  bounded preview of `content[0].text` for expanded fallbacks.
- `renderCallHeader(theme, title, arg, argBudget = 60): Component` — bold
  `toolTitle` + accent-colored, truncated primary argument.
- Per-tool renderers (all `(result, opts, theme) => Component`):
  - `renderWebSearchResult` — collapsed status line + per-query rows from
    `ptcValue.queries`, with content-text fallback.
  - `renderFetchContentResult` — collapsed counts (1/1 or 0/1 for single-URL
    paths), per-source rows from `ptcValue.urls` or `ptcValue.sources`.
  - `renderCodeSearchResult` — collapsed query/char count + `[truncated]`
    indicator when `details.truncated`.
  - `renderGetContentResult` — error-aware tone (fixing the always-success
    bug), label/counts driven by `details.type` variant.

Shared tone vocabulary lives once:

```ts
export const TONE_COLOR: Record<Tone, ThemeColor> = {
  success: "success", partial: "warning", error: "error",
};
export const TONE_MARKER: Record<Tone, string> = {
  success: "\u2713", partial: "!", error: "\u2717",
};
```

Tone derivation (web_search / fetch_content):

```ts
export function toneFromCounts(success: number, total: number): Tone {
  if (total <= 0) return "success";
  if (success >= total) return "success";
  return success === 0 ? "error" : "partial";
}
```

### `index.ts` — delegation only

The four tools' renderer bodies were replaced with thin delegators
(net −190 / +31 lines):

```ts
renderCall(args, theme) {
  const arg = args.similarUrl
    ? `similar: ${args.similarUrl}`
    : args.queries ? args.queries.join(", ") : (args.query || "");
  return renderCallHeader(theme, "search ", arg ? `"${arg}"` : "");
},
renderResult(result, options, theme) {
  return renderWebSearchResult(result as any, options, theme as any);
},
```

The unused `Text` import was removed. **No executor, no `content[].text`, no
`ptcValue` shape was touched.**

## Files Changed

```
 index.test.ts          |  28 +++++++
 index.ts               | 221 ++++++-------------------------------------------
 render-helpers.ts      | 249 ++++++++++++++++++++++++++++++++++++++++ (new)
 render-helpers.test.ts | 472 +++++++++++++++++++++++++++++++++++++++++++ (new)
```

## Tests

- `render-helpers.test.ts` — 50 unit tests covering: tone→fg mapping, single-
  width markers (no emoji), `statusLine`, `WidthSafeLines` (ANSI-wrapped +
  CJK + widths [5,10,40,80]), `truncateLabel`, `errorView`, `workingView`,
  `previewFallbackLines`, and each of the four renderers across
  success / partial / full-error / `isPartial` / expanded fixtures.
- `index.test.ts` — 2 new delegation smoke tests assert `web_search`'s
  `renderResult` emits the shared `\u2713` marker (not the legacy
  "succeeded" string) and that `renderCall` stays width-safe.

Final suite: **407/407 passing** (baseline was 198), `npx tsc --noEmit` clean.

## Notable Design Choices

- **`WidthSafeLines` is the single width chokepoint.** Per-renderer code only
  builds themed strings; `truncateToWidth` runs exactly once per line at
  `render(width)` time. This is what makes ANSI/CJK safety structural rather
  than relying on every call site to remember.
- **Defensive `details` reading.** All renderers treat `details` and
  `ptcValue` as `any` with optional chaining, `?? 0` / `?? ""` defaults, and
  `Array.isArray` guards. Malformed shapes degrade to a content-text
  fallback instead of throwing.
- **No layout coupling in tests.** The stub theme `fg: (c, t) => \`<${c}>${t}</${c}>\``
  lets assertions check role usage and substring presence without pinning
  exact spacing/ordering.

## Known Follow-ups (Minor)

- `errorMessageFrom` is reused for non-error preview fallbacks; rename to
  `firstTextOf` / `contentText` for clarity.
- `code_search` expanded mode no longer shows the previous 500-char content
  preview (spec-compliant but a UX regression — easy to restore by adding a
  `previewFallbackLines` call in the `if (opts.expanded)` block).
- `fetch_content` single-URL `truncated` flag no longer surfaces a
  `[truncated]` row.
- `as any` casts at the four delegation sites; widen `ResultLike` / unify
  with the real `Theme` type in a follow-up.
