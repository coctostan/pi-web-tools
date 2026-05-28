## Tool Selection Guide

| Task | Tool |
|------|------|
| Read a file | `read` (NOT `bash cat`) |
| Edit a file | `edit` (NOT `bash sed`) |
| Create a new file | `write` |
| Search file contents | `grep` (NOT `bash grep/rg`) |
| Search code structure | `ast_search` |
| Find files by filename or path pattern | `find` |
| Find which files contain matching text | `grep` with `summary: true` |
| List a directory | `ls` (NOT `bash ls`) |
| Run project commands | `bash` (tests, builds, git, npm) |
| Symbol definitions/refs | `lsp` |
| Code graph navigation | `symbol_graph`, `symbol_card`, `impact`, `trace` |
| Web research | `web_search` → `fetch_content` → `get_search_content` |
| Complex multi-step work | `agent` (delegate to subagent) |
