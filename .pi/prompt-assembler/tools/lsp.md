Semantic code navigation, refactoring, and diagnostics via the language server.

**Use when:**
- you need definition, references, hover, signature help, rename, code actions, or diagnostics
- exact symbol and type semantics matter more than raw text or syntax shape

**Prefer over:**
- `grep` for symbol lookups and usage sites
- `ast_search` for editor-style semantic operations

**Tips:**
- use `query` when you know the symbol name and do not need exact cursor coordinates
- use `file` + `line` + `column` for point-based operations like definition, references, hover, rename, and code actions
- run `diagnostics` or `workspace-diagnostics` after edits when semantic verification matters