# Spec: Lean Context — Summary Search + File-First Storage

## Goal

Reduce context bloat from `web_search` and `fetch_content` by (1) switching `web_search` from Exa highlights mode (~5-15K tokens per search) to summary mode (~1-2K tokens) as the default, with an opt-in `detail` parameter for highlights, and (2) writing all raw `fetch_content` output (no `prompt`, or `prompt` with filter fallback) to temp files instead of inlining up to 30K chars, returning a 500-char preview + file path so the agent uses `read` for selective access.

## Acceptance Criteria

### Lean Search

1. `searchExa()` called with `detail: "summary"` sends `contents: { summary: true }` in the Exa API request body (not `highlights`).
2. `searchExa()` called with `detail: "highlights"` sends `contents: { highlights: { numSentences: 3, highlightsPerUrl: 3 } }` in the Exa API request body.
3. `searchExa()` called with no `detail` option defaults to `"summary"` behavior (criterion 1).
4. `parseExaResults()` maps Exa's `summary` field (string on each result) to the `snippet` field on `ExaSearchResult`.
5. `parseExaResults()` still maps `highlights` array to `snippet` when `summary` is absent (backward compatibility).
6. `formatSearchResults()` renders summary-mode results without truncating the snippet to 200 chars (summaries are already short).
7. When Exa returns a result with no `summary` and no `highlights`, `parseExaResults()` produces an empty `snippet` string — no crash.
8. The `web_search` tool schema includes a `detail` parameter accepting `"summary"` or `"highlights"`.
9. The `web_search` tool passes the `detail` value through to `searchExa()`.
10. The `web_search` tool description mentions that results are summaries by default and that `detail: "highlights"` is available for more context.

### File-First Storage

11. When `fetch_content` is called without `prompt` for a single non-GitHub URL, the extracted content is written to a temp file, and the response contains a preview (first 500 chars) + the file path.
12. When `fetch_content` is called without `prompt` for multiple URLs, each URL's extracted content is written to its own temp file, and the response lists each with a 500-char preview + file path.
13. When `fetch_content` is called with `prompt` and filtering succeeds, the filtered answer is returned inline — no file is written.
14. When `fetch_content` is called with `prompt` but filtering fails (no API key / model error), the raw content is written to a temp file with a 500-char preview + file path (not inlined up to 30K).
15. GitHub clone results (directory trees) are returned inline as before — no file-first behavior.
16. The `FILE_FIRST_PREVIEW_SIZE` constant in `offload.ts` is set to 500 (separate from the existing `PREVIEW_SIZE` of 2000 used by the `tool_result` interceptor).
17. The `MAX_INLINE_CONTENT` constant (30K) is no longer used in the `fetch_content` handler for raw or fallback content paths — those paths use file-first instead.
18. Temp files created by file-first are tracked and cleaned up by `cleanupTempFiles()` on session shutdown.
19. `get_search_content` still works for fetch results — full content remains in the in-memory store regardless of file-first.
20. The `tool_result` interceptor continues to function as a safety net for other tools (`code_search`, `get_search_content`) — no changes to its behavior.
21. If writing a temp file fails (e.g., disk full), `fetch_content` returns the content inline with a warning instead of crashing.
22. The `fetch_content` tool description mentions that raw fetches return a preview + file path and that `read` can be used to explore further.

## Out of Scope

- **`code_search` file-first** — `code_search` results are structured snippets, not raw page dumps. Extend later if needed.
- **Changes to `get_search_content`** — It continues to serve full content from the in-memory store.
- **Changes to the `tool_result` interceptor** — It stays as the safety net with its existing `PREVIEW_SIZE` (2000) and `FILE_OFFLOAD_THRESHOLD` (30K).
- **Exa `text` mode** — Only `summary` and `highlights` are exposed via the `detail` parameter.
- **Prompt-mode `fetch_content` changes** — Successful filtered responses remain inline (~200-1000 chars). No file-first for those.
- **Config file changes** — No new config options. The `detail` parameter is per-call, not a global setting.

## Open Questions

*None.*
