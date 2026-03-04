# Agents Guide — pi-web-tools

> Quick context for AI agents working on this codebase.

## What This Is

A [pi](https://github.com/nicholasgasior/pi-coding-agent) extension providing web search, code search, content extraction, and GitHub repo cloning. Powered by the [Exa API](https://exa.ai). Published as `@coctostan/pi-exa-gh-web-tools`.

## Architecture

**Single entry point:** `index.ts` registers 4 tools with pi's `ExtensionAPI`:
- `web_search` → `exa-search.ts` (Exa `/search`)
- `code_search` → `exa-context.ts` (Exa `/context`)
- `fetch_content` → `extract.ts` (Readability + PDF) / `github-extract.ts` (GitHub repos)
- `get_search_content` → `storage.ts` (retrieve stored results)

**Supporting modules:**
| File | Role |
|------|------|
| `config.ts` | Loads `~/.pi/web-tools.json`, hot-reloads every 30s |
| `tool-params.ts` | Normalizes/validates tool input params |
| `truncation.ts` | Truncates content to fit context limits |
| `offload.ts` | Writes large results to temp files, returns preview + path |
| `storage.ts` | In-memory result store with session persistence |

## Key Patterns

- **Extension API:** `export default (pi: ExtensionAPI) => { pi.addTool(...) }` — see pi extension docs
- **Config access:** `getConfig()` returns cached config, auto-reloads from disk
- **Content flow:** Fetch → extract → truncate (30K inline) → offload if still too large → store full for `get_search_content`
- **GitHub cloning:** Tries `gh repo clone` first, falls back to `git clone`, caches in `/tmp/pi-github-repos`
- **Session lifecycle:** `onSessionStart` clears state; `onSessionShutdown` aborts pending fetches and cleans temp files

## Dev Commands

```bash
npm install          # install deps
npm test             # vitest (110 tests)
npm run test:watch   # watch mode
pi -e ./index.ts     # load extension in pi for manual testing
```

## Testing

Vitest with co-located test files (`*.test.ts`). Tests mock network calls — no Exa API key needed to run tests.

## What's Next

See `ROADMAP.md` for the v2 plan. TL;DR: stop dumping raw content into the main model's context. Three big moves:
1. **Haiku filter** on `fetch_content` (10-50x context reduction)
2. **Lean search results** (summaries instead of highlights)
3. **File-first storage** (always write to file, return preview + path)
