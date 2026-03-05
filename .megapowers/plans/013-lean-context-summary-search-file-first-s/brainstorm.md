# Brainstorm: Lean Context — Summary Search + File-First Storage

## Approach

Two complementary changes to reduce context bloat from pi-web-tools. **Lean search** (Issue #002) switches `web_search` from Exa's `highlights` mode (3 sentences × 3 per URL = 5-15K tokens per search) to `summary` mode (1-line summary per result = ~1-2K tokens). A new `detail` parameter lets the agent opt back into highlights when needed. **File-first storage** (Issue #003) eliminates the 30K inline content threshold for raw `fetch_content` calls — all raw content goes to a temp file, and the tool returns a 500-char preview + file path. The agent uses `read` for selective access.

Together these complete the v2.0 "context-aware architecture" shift (alongside the already-implemented Haiku filter from PR #5). The principle: **if the main model is getting raw content, minimize it.** Search results become a table of contents. Fetched pages become files the agent can browse selectively. Filtered fetches (with `prompt`) remain inline since they're already small (~200-1000 chars).

Both changes are small, independent, and well-isolated — touching `exa-search.ts`, `index.ts`, and `offload.ts` with clear test boundaries.

## Key Decisions

- **Summary mode as default** — Exa's `summary` returns 1-line per result vs. 9 sentences. Agent sees what's available, uses `fetch_content` with `prompt` to dig deeper.
- **`detail` parameter** — Values: `"summary"` (default) or `"highlights"`. Keeps backward compatibility when the agent needs more upfront.
- **500-char preview for file-first** — Lean enough to assess relevance, pushes agent to use `read` for selective access. (Existing offload uses 2000 chars — too generous for the file-first philosophy.)
- **File-first applies to `fetch_content` only** — `code_search` results are already structured snippets, not raw page dumps. Extend later if needed (YAGNI).
- **Filter fallback also goes file-first** — When `prompt` is provided but filtering fails (no API key), the raw fallback goes to file. Consistent rule: raw content = file.
- **GitHub clone results stay as-is** — The directory tree IS a preview. Agent already uses `read` for individual files.
- **`tool_result` interceptor unchanged** — Stays as safety net for unexpectedly large results from other tools (`code_search`, `get_search_content`).
- **Empty/missing summary graceful fallback** — If Exa returns no summary for a result, show title + URL only. Still useful for the agent to decide what to fetch.
- **Temp file write failure → inline fallback** — Don't crash because we can't write a temp file. Return content inline with a warning.

## Components

### Lean Search (Issue #002)
1. **`exa-search.ts` — `searchExa()`** — Accept `detail` option. When `"summary"`: send `contents: { summary: true }`. When `"highlights"`: send current `{ highlights: { numSentences: 3, highlightsPerUrl: 3 } }`.
2. **`exa-search.ts` — `parseExaResults()`** — Map Exa's `summary` field to existing `snippet` field on `ExaSearchResult`.
3. **`exa-search.ts` — `formatSearchResults()`** — Render summary-mode results (title + URL + summary). No 200-char truncation needed since summaries are already short.
4. **`index.ts`** — Add `detail` param to `WebSearchParams` schema, pass through to `searchExa()`.
5. **Tool description update** — Mention that results are summaries by default; use `detail: "highlights"` for more.

### File-First Storage (Issue #003)
1. **`index.ts` — `fetch_content` handler** — For raw fetches (no `prompt`, or `prompt` with filter fallback): write to temp file via `offloadToFile()`, return preview (500 chars) + file path. Affects single-URL and multi-URL paths.
2. **`offload.ts`** — Add a `FILE_FIRST_PREVIEW_SIZE = 500` constant (separate from existing `PREVIEW_SIZE = 2000` used by the interceptor).
3. **Tool description update** — Mention that raw fetches return a preview + file path; use `read` to explore further.

## Testing Strategy

### Lean Search Tests (`exa-search.test.ts`)
- `searchExa()` with `detail: "summary"` → asserts Exa request body has `contents: { summary: true }`
- `searchExa()` with `detail: "highlights"` → asserts old highlights config in request
- `searchExa()` with no `detail` → defaults to `"summary"`
- `parseExaResults()` maps `summary` field to `snippet`
- `formatSearchResults()` renders summary-mode results correctly
- `formatSearchResults()` still handles highlights-mode (backward compat)
- Empty/missing summary → title + URL only, no crash

### File-First Tests (`index.test.ts`, `offload.test.ts`)
- Raw single-URL fetch → content written to temp file, response has 500-char preview + path
- Raw multi-URL fetch → each URL gets its own temp file
- `prompt` fetch (filter success) → returns filtered answer inline, NO file
- `prompt` fetch fallback (no API key) → goes file-first
- Preview is first 500 chars (or full content if shorter)
- Temp file contains complete extracted content
- `cleanupTempFiles()` removes created files on shutdown
- `get_search_content` still works (content in memory store)
- `tool_result` interceptor still catches other tools' large output
- Temp file write failure → inline fallback with warning

All tests mock network calls — no Exa API key needed. Follow existing patterns in `exa-search.test.ts` and `extract.test.ts`.
