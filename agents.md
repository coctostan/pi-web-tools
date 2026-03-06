# Agents Guide — pi-web-tools

> Quick context for AI agents working on this codebase.

## What This Is

A [pi](https://github.com/nicholasgasior/pi-coding-agent) extension providing web search, code search, content extraction, and GitHub repo cloning. Powered by the [Exa API](https://exa.ai). Published as `@coctostan/pi-exa-gh-web-tools`.

## Architecture

**Single entry point:** `index.ts` registers 4 tools with pi's `ExtensionAPI`:
- `web_search` → `exa-search.ts` (Exa `/search` or `/findSimilar`) + `smart-search.ts` (query enhancement + dedup)
- `code_search` → `exa-context.ts` (Exa `/context`)
- `fetch_content` → `extract.ts` (Readability + PDF) / `github-extract.ts` (GitHub repos) + `filter.ts` (Haiku filter)
- `get_search_content` → `storage.ts` (retrieve stored results)

**Supporting modules:**
| File | Role |
|------|------|
| `config.ts` | Loads `~/.pi/web-tools.json`, hot-reloads every 30s |
| `tool-params.ts` | Normalizes/validates tool input params |
| `smart-search.ts` | Query enhancement (expand vague queries, detect errors → keyword) + result dedup/cleanup |
| `filter.ts` | Haiku filter: resolves cheap model, sends page + prompt, returns focused answer |
| `retry.ts` | `retryFetch()` — max 2 retries, exponential backoff (1s → 2s), retries on 429/5xx |
| `truncation.ts` | Truncates `get_search_content` output to `maxChars` limit |
| `offload.ts` | File-first: writes all raw fetch content to temp files, returns 500-char preview + path |
| `storage.ts` | In-memory result store with session persistence |

## Key Patterns

- **Extension API:** `export default (pi: ExtensionAPI) => { pi.addTool(...) }` — see pi extension docs
- **Config access:** `getConfig()` returns cached config, auto-reloads from disk
- **web_search flow:** Query → `enhanceQuery()` (smart expand / keyword override) → `searchExa()` (with retry) → `postProcessResults()` (dedup + snippet clean) → format → store
- **fetch_content flow (with `prompt`):** Fetch → extract → `filterContent()` (cheap model call) → return focused answer (~200–1000 chars)
- **fetch_content flow (raw):** Fetch → extract → `offloadToFile()` → return 500-char preview + file path
- **GitHub cloning:** Tries `gh repo clone` first, falls back to `git clone`, caches in `/tmp/pi-github-repos`
- **Session lifecycle:** `session_start/switch/fork/tree` → abort pending, clear caches, restore storage; `session_shutdown` → abort pending, clear all state, clean temp files
- **Retry:** All Exa API calls wrapped in `retryFetch()` — retries 429, 500-504 with exponential backoff; never retries 400/401/403/abort

## Dev Commands

```bash
npm install          # install deps
npm test             # vitest (198 tests)
npm run test:watch   # watch mode
pi -e ./index.ts     # load extension in pi for manual testing
```

## Testing

Vitest with co-located test files (`*.test.ts`). Tests mock network calls — no Exa API key needed to run tests.

## What's Next

See `ROADMAP.md`. The v2 architecture is complete — all of v2.0–v2.3 is shipped:
- ✅ Haiku filter on `fetch_content` (`prompt` param)
- ✅ Summary-first search (default) + `detail: "highlights"` opt-in
- ✅ File-first raw fetch storage
- ✅ Retry/backoff on all Exa calls
- ✅ Parallel batch search via `p-limit(3)`
- ✅ Session-level URL cache
- ✅ `freshness` filter + `similarUrl` (`findSimilar`)
- ✅ Smart query enhancement + result dedup

Next candidates are in `ROADMAP.md` under "Later / When Needed".
