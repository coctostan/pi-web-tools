Run shell commands when no purpose-built tool is better.

**Use when:**
- you need to run project commands, tests, build tools, package managers, git status/diff, or ad hoc shell pipelines
- the task cannot be expressed cleanly with `read`, `grep`, `find`, `ls`, `edit`, or other structured tools

**Prefer over:**
- nothing for code exploration; prefer structured tools first
- `read`, `grep`, `find`, and `ls` for normal file inspection and search

**Tips:**
- set `timeout` for anything that might run longer than a couple seconds
- avoid interactive, watch-mode, or indefinite commands unless explicitly requested
- keep commands targeted and safe for the current working directory

**Do NOT use bash for these tasks — use the dedicated tools instead:**

| Task | Use this | NOT this |
|------|----------|----------|
| Read files | `read` | `cat`, `head`, `tail`, `less` |
| Edit files | `edit` | `sed`, `awk`, `perl -i` |
| Search content | `grep` | `grep`, `rg`, `ag` via bash |
| Search structure | `ast_search` | `grep` for code patterns |
| Find files | `grep` with `summary: true`, or `find` tool | `find` command via bash |
| List directories | `ls` tool | `ls` command via bash |
| Write files | `write` | `echo >`, `cat <<EOF >`, `tee` |
| Fetch URLs | `fetch_content` | `curl`, `wget` |

**Never use `cd` in commands.** Set the working directory via the tool's parameters instead.