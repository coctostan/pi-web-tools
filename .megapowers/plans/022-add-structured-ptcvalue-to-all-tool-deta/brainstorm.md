# Brainstorm: Add structured ptcValue to all tool details for PTC interop

## Goal

Add `details.ptcValue` to all 4 web-tools executors (`web_search`, `fetch_content`, `code_search`, `get_search_content`) and add `ptc` metadata to their tool definitions. This lets PTC's `code_execution` tool consume web-tools results as structured Python objects instead of parsing human-readable markdown text.

## Mode

Direct requirements — the roadmap item (3.0.1) and PTC consumer code are both concrete. The only design work is defining the structured shapes per tool.

## Must-Have Requirements

- **R1:** `web_search` returns `details.ptcValue` containing a structured object with `responseId`, an array of per-query results (each with `query`, `results[]` of `{title, url, snippet}`, and `error` if any), and aggregate counts (`queryCount`, `successfulQueries`, `totalResults`).
- **R2:** `fetch_content` returns `details.ptcValue` containing a structured object with `responseId`, an array of per-URL results (each with `url`, `title`, `content` or `filtered` text, `filePath` if offloaded, and `error` if any).
- **R3:** `code_search` returns `details.ptcValue` containing a structured object with `responseId`, `query`, `content` (the code text), and `error` if any.
- **R4:** `get_search_content` returns `details.ptcValue` containing a structured object with the retrieved content, `type` (search/fetch/context), and relevant metadata matching the stored result type.
- **R5:** All 4 tool registrations include `ptc: { callable: true, policy: "read-only" }` metadata so PTC knows these tools are available for programmatic use and won't mutate state.
- **R6:** The existing `details` fields (`responseId`, `queryCount`, etc.) remain unchanged — `ptcValue` is additive, not a replacement. Existing text `content` output is not modified.
- **R7:** When a tool returns an error, `ptcValue` still includes the error information in structured form (not just the text message).
- **R8:** The `ptcValue` shapes are stable — they should match what PTC's `normalizeToolResult` expects (pass-through, no further parsing needed).

## Optional / Nice-to-Have

- **O1:** Add `pythonName` to ptc metadata for cleaner Python function names (e.g., `web_search` stays as-is, but `fetch_content` and `get_search_content` could have aliases).
- **O2:** Include `publishedDate` from Exa results in the `web_search` ptcValue when available.

## Explicitly Deferred

- **D1:** Python helper wrappers in PTC's `code_execution` description/helpers for web-tools — that's a PTC-side concern.
- **D2:** Changing the human-readable text output format — this issue is purely additive.

## Constraints

- **C1:** Must not break any existing tests (198 tests green).
- **C2:** The `ptcValue` is consumed by PTC's `extractPtcValue()` which checks `details.ptcValue` — the field must be at exactly that path.
- **C3:** `ptcValue` is passed through as-is by PTC — no further normalization. The shapes must be self-contained and JSON-serializable.
- **C4:** Tool registration `ptc` field follows the `PtcToolOptions` interface: `{ callable?: boolean, policy?: "read-only" | "mutating", pythonName?: string, ... }`.

## Open Questions

None.

## Recommended Direction

Add `ptcValue` to the `details` object in each tool's return statement(s). Each tool has multiple return paths (success, error, single vs. multi-URL, filtered vs. raw, etc.) — every path needs a `ptcValue`.

For `web_search`, the ptcValue should mirror the existing `StoredResultData` shape that's already being constructed — it has `queries[]` with per-query `results[]`. This avoids duplicating logic.

For `fetch_content`, the shape varies by path: filtered (prompt) returns `{ filtered: string }`, raw offloaded returns `{ filePath, preview }`, GitHub clone returns `{ content, title }`. The ptcValue should normalize these into a consistent per-URL shape with optional fields.

For `code_search` and `get_search_content`, the shapes are simpler — single content string with metadata.

The `ptc` metadata on tool definitions is a one-liner per tool. All 4 tools are read-only (they fetch/search but don't mutate anything).

## Testing Implications

- Unit tests for each tool executor verifying `details.ptcValue` is present and correctly shaped on success and error paths.
- Tests should verify the ptcValue is JSON-serializable.
- Tests should verify existing `details` fields are unchanged (backward compatibility).
- Tests should cover all return paths per tool (single/multi URL, filtered/raw, error cases, GitHub clone).
- Existing 198 tests must continue to pass.
