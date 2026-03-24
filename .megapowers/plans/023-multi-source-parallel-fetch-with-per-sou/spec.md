# Spec: Multi-source parallel fetch — ptcValue shape cleanup

## Goal

Clean up the `ptcValue` output shape for the multi-URL + prompt path in `fetch_content`. The current shape has cluttered field names and includes noise fields (nulls for `content`, `filePath`, `title`) that are irrelevant when content has been Haiku-filtered to a focused answer. Rename fields for clarity, echo the prompt, and emit minimal per-source entries.

## Acceptance Criteria

1. **`ptcValue.sources` replaces `ptcValue.urls`** — The multi-URL + prompt `ptcValue` uses `sources` as the array key instead of `urls`.

2. **`answer` replaces `filtered`** — Each successfully filtered source entry uses `answer` (not `filtered`) for the Haiku-filtered text.

3. **`contentLength` replaces `charCount`** — Each source entry uses `contentLength` (not `charCount`) for the character count.

4. **`prompt` echoed in ptcValue** — The top-level `ptcValue` object includes `prompt` with the user's prompt string.

5. **Filtered success entries are minimal** — When a source is successfully filtered, its ptcValue entry contains only `{ url, answer, contentLength }`. No `content`, `filePath`, `title`, or `error` fields.

6. **Filter-fallback entries retain needed fields** — When filtering fails (no model available) and content falls back to raw/offloaded, the entry contains `{ url, title, content, filePath, contentLength }` — enough to locate the raw content. No `answer` or `error` fields.

7. **Error entries are minimal** — When a source fetch errors, its ptcValue entry contains only `{ url, error }`. No null `answer`, `contentLength`, `title`, `content`, or `filePath`.

8. **Human-readable text output unchanged** — The `content[0].text` string (blocks joined with `---`) remains exactly as-is. No formatting changes.

9. **`details` shape unchanged (except `ptcValue`)** — `details.responseId`, `details.successCount`, `details.totalCount`, `details.filtered` retain their current names and types. Only the nested `ptcValue` object changes.

10. **Single-URL and no-prompt paths unchanged** — The `ptcValue` shape for single-URL+prompt, multi-URL without prompt, and single-URL without prompt are not modified.

## Out of Scope

- **O1 / D1**: `sourceType` field — no consumers exist, add when needed
- **D2**: Single-URL + prompt ptcValue cleanup — align later if needed
- **D3**: No-prompt (raw fetch) ptcValue cleanup — separate issue
- **C3**: Concurrency changes — `p-limit(3)` stays as-is

## Open Questions

None.

## Requirement Traceability

- `R1` → AC 1
- `R2` → AC 2
- `R3` → AC 3
- `R4` → AC 4
- `R5` → AC 5
- `R6` → AC 7
- `R7` → AC 8
- `R8` → AC 9
- `O1` → Out of Scope
- `D1` → Out of Scope
- `D2` → Out of Scope (AC 10 enforces boundary)
- `D3` → Out of Scope (AC 10 enforces boundary)
- `C1` → AC 9
- `C2` → AC 9
- `C3` → Out of Scope

Note: AC 6 (filter-fallback entries) was added during spec — it covers a code path (lines 654-675 in index.ts) where Haiku filtering fails and content gets offloaded. This path also needs a clean ptcValue shape but wasn't called out as a separate brainstorm requirement.
