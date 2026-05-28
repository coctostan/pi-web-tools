## Goal
The four pi-web-tools tools (`web_search`, `fetch_content`, `code_search`, `get_search_content`) each implement their own ad-hoc `renderCall`/`renderResult` logic, producing inconsistent collapsed status lines, inconsistent (and sometimes missing) expanded views, and width-unaware text slicing. This issue improves the **TUI presentation only** — making tool call headers and results consistent, scannable, and visually clear (status, counts, per-item hierarchy, errors/fallbacks) — without changing any model-facing output text or PTC data.

## Mode
`Exploratory` → converged. The issue listed only candidate areas with no fixed behavior, so we explored pi's TUI capabilities and settled on a "consistency + richer hierarchy" level using plain themed rows.

## Must-Have Requirements
- **R1** All four tools render their collapsed result via a single shared status-line helper producing a uniform structure: `[status marker] [primary label] [counts/metadata]`.
- **R2** The status line uses consistent theme color roles across all tools: `success` for fully-successful results, `warning` for partial/degraded (e.g. fallback, some sources failed), `error` for failed results.
- **R3** A consistent status marker vocabulary is used across all tools — themed single-width glyphs (`✓` success / `!` partial / `✗` error) where color carries the primary meaning — defined once in the shared helper. Model-facing emoji (`✅`/`⚠`/`❌`) are NOT reused for TUI markers.
- **R4** All four tools support a consistent expanded view (`expanded === true`) showing per-item detail as plain themed rows (`Container`/array of `Text`), built only from `result.details` (including `ptcValue`).
- **R5** For `web_search`, the expanded view lists per-query line items showing query text and per-query status/result count (and error if present).
- **R6** For `fetch_content`, the expanded view lists per-source line items read uniformly from `details.ptcValue` (`urls[]`/`sources[]`), showing title/URL, status marker, char count, and error/fallback note where applicable.
- **R7** For `code_search`, the expanded view shows the query label, char count, and truncation indicator.
- **R8** Every rendered line is width-aware: no rendered line exceeds the `width` passed to `render()`, using `truncateToWidth`/`visibleWidth`/`wrapTextWithAnsi` rather than raw `.slice()`.
- **R9** `renderCall` headers remain consistent across tools (bold tool title + accent-colored primary arg), preserving current behavior while sharing the truncation helper.
- **R10** Error results render through a consistent error path (theme `error` role) across all four tools.
- **R11** The `isPartial` (in-progress) state renders a consistent themed "working" indicator across all four tools.
- **R12** No change to any tool's `content[].text` (model-facing output) or `details.ptcValue` (PTC contract).
- **R13** When a tool's per-item `details`/`ptcValue` fields are absent or incomplete, the expanded view falls back gracefully to a width-safe preview of `content[0].text`.

## Optional / Nice-to-Have
- **O1** A subtle visual separator or indentation scheme between line items in expanded view for extra scannability.
- **O2** Show cache/fallback badges in the collapsed line where relevant (e.g. "cached", "raw fallback") when that info exists in `details`.
- **O3** `get_search_content` gains a consistent `renderResult` (it currently appears to rely on default rendering).
- **O4** Truncate/format long URLs intelligently (e.g. drop scheme, keep host+path tail).

## Explicitly Deferred
- **D1** Interactive/overlay components (selectable result lists, dialogs) — renderers stay non-interactive.
- **D2** Changing model-facing output text formatting (the ✅/❌ blocks, "Fetched N/M URLs") — explicitly excluded.
- **D3** `Markdown`-component-based rendering of results — rejected in favor of plain themed rows.
- **D4** Streaming progress via `_onUpdate` — already "Later" on the roadmap.
- **D5** Images/boxed/framed layouts (`Box`, `DynamicBorder`) for results — beyond this slice unless trivially helpful.

## Constraints
- **C1** Changes are confined to `renderCall`/`renderResult` (and a new shared render helper module); executors and their return shapes are untouched.
- **C2** Renderers may only use data already present in `result.details`/`ptcValue`; no new executor-side data may be added solely for rendering (honoring R12).
- **C3** Must use pi-tui primitives only (`Text`, `Container`, `Spacer`, theme `fg`/`bold`, width utils); no direct theme imports — use the `theme` param.
- **C4** Renderers must remain stateless-per-render (fresh components each call) so theme changes via `invalidate()` are reflected correctly.
- **C5** Existing test suite (198 tests) must stay green; rendering logic should be unit-testable in isolation.

## Open Questions
None.

## Recommended Direction
Introduce a small shared rendering helper module (e.g. `render-helpers.ts`) that centralizes the visual vocabulary: a `statusLine({ marker, label, counts, tone })` builder and a `renderItemRows(items, theme, width)` builder that emits width-safe themed `Text` rows inside a `Container`. Each tool's `renderCall`/`renderResult` becomes a thin adapter mapping its `details`/`ptcValue` into these shared builders. This removes the current divergence (three different success phrasings, two of four tools lacking expand previews, raw 500-char slices) while keeping every executor — and therefore all model-facing and PTC behavior — untouched.

The expanded view is built from the structured `ptcValue` already present in `details` (per-query and per-source arrays), so we get useful per-item hierarchy (titles, URLs, status, char counts, errors) without adding executor-side data or changing what the model sees. Because all `fetch_content` paths already populate `ptcValue.urls`/`ptcValue.sources`, the helper can read sources uniformly; where structure is missing it falls back to a width-safe `content` preview (R13).

Correctness focus areas are width-safety (replace `.slice()` with `truncateToWidth`/`wrapTextWithAnsi`) and statelessness (fresh components each render so theme changes propagate). These also fix latent bugs in the current renderers.

## Testing Implications
- Unit-test the shared helpers: `statusLine` tone→color mapping, marker selection (success/partial/error), and `renderItemRows` width-safety (assert every output line's `visibleWidth` ≤ width, including with ANSI codes).
- Test each tool's `renderResult` with representative `details`/`ptcValue` fixtures: full success, partial (some queries/sources failed), full error, and `isPartial` states — assert structure and tone, not exact pixels.
- Test the R13 fallback path when per-item `details` fields are absent.
- Snapshot-style assertions on collapsed status-line text per tool to lock consistency (R1–R3).
- Confirm executors/`content.text`/`ptcValue` are unchanged (existing 198 tests remain green; no executor test fixtures modified).
