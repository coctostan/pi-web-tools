Search file contents by text or regex and return anchored matches.

**Use when:**
- you need raw text search, especially across many files
- you want anchored matches that can be fed into `edit`

**Prefer over:**
- `bash` for normal codebase text search
- `ast_search` when the query is structural rather than textual
- `symbol_search` or `lsp` when you need semantic lookup instead of text matches

**Tips:**
- use `literal: true` for exact string search
- use `glob`, `path`, `context`, and `limit` to keep results focused
- use `summary: true` for per-file counts instead of full match lines

**Prefer `grep` over bash search:**
- Use `grep` instead of `bash grep` or `bash rg` — it returns anchored matches for `edit`
- Use `grep` with `summary: true` when you only need which files contain matching text, or per-file match counts
- Use `ast_search` instead of `grep` when matching code structure (calls, imports, JSX)