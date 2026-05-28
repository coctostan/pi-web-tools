## Goal
Make the TUI presentation of all four pi-web-tools tools (`web_search`, `fetch_content`, `code_search`, `get_search_content`) consistent, scannable, and width-safe by routing every `renderCall`/`renderResult` through a shared render-helper module. Collapsed results get a uniform `[marker] [label] [counts]` status line with consistent color/marker vocabulary; expanded results show per-item hierarchy built from existing `details`/`ptcValue`. No executor logic, model-facing `content[].text`, or `ptcValue` data changes.

## Acceptance Criteria

1. A new shared render-helper module (e.g. `render-helpers.ts`) exists and exports a status-line builder taking a tone (`success`/`partial`/`error`), an optional marker, a primary label, and optional counts/metadata, returning a themed single-line string.
2. The status-line builder maps tone→theme `fg` role: `success`→`success`, `partial`→`warning`, `error`→`error`.
3. The status-line builder selects a single-width marker by tone: `✓` for success, `!` for partial, `✗` for error; markers are defined once in the module; emoji `✅`/`⚠`/`❌` are not used.
4. The module exports a row-builder that, given item rows, a `theme`, and a `width`, returns a `Container` (or array) of `Text` rows where every rendered line satisfies `visibleWidth(line) <= width` (verified including ANSI codes).
5. The module exports/uses a width-safe truncation helper based on `truncateToWidth` (not raw `.slice()`), used wherever text could exceed `width`.
6. `web_search` `renderResult` renders its collapsed line via the shared status-line builder, choosing tone from success/total/error counts (`success` when all queries succeed, `partial` when some fail, `error`/empty path when all fail).
7. `web_search` expanded view lists per-query rows from `details.ptcValue.queries`, each showing query text, per-query result count, and error text when `error` is set, as width-safe themed rows.
8. `fetch_content` `renderResult` renders its collapsed line via the shared status-line builder, choosing tone from `details.successCount`/`details.totalCount` (single-URL success/error treated as 1/1 or 0/1).
9. `fetch_content` expanded view lists per-source rows read uniformly from `details.ptcValue` (`urls[]` or `sources[]`), each showing title/URL, a tone marker, char count when present, and an error/fallback note when present, as width-safe themed rows.
10. `code_search` `renderResult` renders its collapsed line via the shared status-line builder (success tone for non-error results, error tone for error results).
11. `code_search` expanded view shows the query label, char count, and a truncation indicator when `details.truncated` is true, as width-safe themed rows.
12. `get_search_content` `renderResult` is rewritten to use the shared status-line builder, selecting `error` tone for error results (currently it always renders `success`), with an expanded view consistent with the other tools.
13. All four tools render the error case (`result.isError === true`) through a single consistent path using the `error` theme role, with a width-safe message.
14. All four tools render the `isPartial === true` (in-progress) state through a consistent themed "working" indicator using the `warning` role.
15. All four tools' `renderCall` headers produce bold `toolTitle` + accent-colored primary argument, sharing the same width-safe truncation helper for the argument.
16. When a tool's expected per-item `details`/`ptcValue` fields are absent or incomplete, the expanded view falls back to a width-safe preview of `content[0].text` instead of throwing or rendering empty.
17. No executor code paths, `content[].text` strings, or `details.ptcValue` shapes are modified; the existing test suite (198 tests) remains green.
18. The shared helpers are covered by unit tests asserting tone→color mapping, marker selection, and width-safety (`visibleWidth(line) <= width`) for representative inputs including long/multi-byte/ANSI content.
19. Each tool's `renderResult` is covered by tests over representative `details`/`ptcValue` fixtures: full success, partial, full error, and `isPartial` — asserting tone/marker and structure rather than exact layout.

## Out of Scope
- Interactive/overlay components, selectable lists, or dialogs (D1) — renderers stay non-interactive.
- Changing model-facing output text formatting, e.g. the `✅`/`❌` blocks or "Fetched N/M URLs" in `content[].text` (D2, R12).
- `Markdown`-component-based result rendering (D3) — plain themed rows only.
- Streaming progress via `_onUpdate` (D4).
- `Box`/`DynamicBorder`/image/framed layouts for results (D5).
- O1 (separators/indentation), O2 (cache/fallback badges in collapsed line), O4 (intelligent URL formatting) are not required for this slice; they may be implemented opportunistically if trivial but are not acceptance-gated.
- Note on O3: the brainstorm assumed `get_search_content` lacked a renderer; it actually has one (ad-hoc, lines ~1127–1184 of `index.ts`). AC 12 covers bringing it into the shared pattern, so O3's intent is in scope, not deferred.

## Open Questions
None.

## Requirement Traceability
- `R1 -> AC 1, AC 6, AC 8, AC 10, AC 12`
- `R2 -> AC 2`
- `R3 -> AC 3`
- `R4 -> AC 4, AC 7, AC 9, AC 11`
- `R5 -> AC 7`
- `R6 -> AC 9`
- `R7 -> AC 11`
- `R8 -> AC 4, AC 5`
- `R9 -> AC 15`
- `R10 -> AC 13`
- `R11 -> AC 14`
- `R12 -> AC 17`
- `R13 -> AC 16`
- `O1 -> Out of Scope`
- `O2 -> Out of Scope`
- `O3 -> AC 12 (in scope; brainstorm assumption corrected)`
- `O4 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `D4 -> Out of Scope`
- `D5 -> Out of Scope`
- `C1 -> AC 17 (executors untouched; new helper module)`
- `C2 -> AC 16, AC 17 (render only from existing details/ptcValue)`
- `C3 -> AC 4, AC 15 (pi-tui primitives + theme param)`
- `C4 -> AC 18, AC 19 (stateless fresh components; verified by tests)`
- `C5 -> AC 17, AC 18, AC 19`
