# Brainstorm: Multi-source parallel fetch with per-source filtering

## Goal

The multi-URL + prompt path in `fetch_content` already works (parallel fetch, per-source Haiku filtering, per-source error isolation). But the `ptcValue` output shape is cluttered — it includes fields like `content`, `filePath`, and `title` that are irrelevant when content has been filtered down to a focused answer. This issue cleans up the output structure: rename fields for clarity (`filtered` → `answer`, `charCount` → `contentLength`), echo the `prompt`, rename `urls` → `sources`, and drop noise fields from the filtered path.

## Mode

`Direct requirements` — the feature (parallel fetch + filter) is already implemented. This is a concrete output-shape polish with clear before/after.

## Must-Have Requirements

- **R1**: In the multi-URL + prompt `ptcValue`, rename the top-level `urls` array to `sources`
- **R2**: In each source entry, rename `filtered` to `answer`
- **R3**: In each source entry, rename `charCount` to `contentLength`
- **R4**: Echo the `prompt` string in the top-level `ptcValue` object
- **R5**: When a source was successfully filtered, omit `content`, `filePath`, and `title` from that source's ptcValue entry (they're noise — the `answer` is the payload)
- **R6**: When a source errored, include `url` and `error` only (no nulls for `answer`/`contentLength`)
- **R7**: The human-readable text output (the `content[0].text` block) does not change — only `ptcValue` structure changes
- **R8**: The `details` object (outside `ptcValue`) keeps its current shape for backward compat with `renderResult` and any existing consumers

## Optional / Nice-to-Have

- **O1**: Add `sourceType` field to each source entry (e.g. `"web"`, `"github"`, `"pdf"`) for future use

## Explicitly Deferred

- **D1**: `sourceType` detection — no consumers exist yet, add when needed
- **D2**: Changing the single-URL + prompt ptcValue shape — keep this scoped to multi-URL only, align single-URL later if needed
- **D3**: Changing the no-prompt (raw fetch) ptcValue shape

## Constraints

- **C1**: Must not break existing `renderResult` logic — it reads from `details`, not `ptcValue`
- **C2**: Must not change the `StoredResultData` shape in storage — `ptcValue` is a pass-through on `details`, not persisted separately
- **C3**: Keep `p-limit(3)` concurrency unchanged

## Open Questions

None.

## Recommended Direction

This is a surgical refactor of the multi-URL + prompt code path in `index.ts` (lines ~632-690). The `ptcUrls` array construction gets updated to emit the cleaner shape, and the top-level `ptcValue` object gets `prompt` added and `urls` renamed to `sources`.

The key insight is that `ptcValue` is consumed by PTC's `tool-adapters.ts` and exposed to Python code in `code_execution`. A cleaner shape means Python code can do `result.sources[0].answer` instead of `result.urls[0].filtered`, which is more intuitive and self-documenting.

No changes to the filter logic, fetch logic, error handling, or human-readable text output. The stored data shape also stays the same — `ptcValue` lives on `details` and isn't independently persisted.

## Testing Implications

- Test that multi-URL + prompt returns `ptcValue` with `sources` (not `urls`), `prompt`, and per-source `answer`/`contentLength` fields
- Test that successfully filtered sources omit `content`, `filePath`, `title`
- Test that errored sources have only `url` and `error`
- Test that `details.successCount`/`totalCount`/`filtered`/`responseId` are unchanged
- Test that the human-readable text output is unchanged
- Existing multi-URL+prompt tests should be updated to verify the new shape
