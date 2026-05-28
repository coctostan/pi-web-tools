Surgically modify files using anchored references from `read` or `grep`.

**Use when:**
- you already have `LINE:HASH` anchors and want precise, minimal edits
- you need validated single-line or range replacement

**Prefer over:**
- `write` for changes to existing files
- broad string replacement unless there is no reliable anchor

**Tips:**
- prefer `set_line`, `replace_lines`, and `insert_after` over global `replace`
- copy anchors exactly from the latest `read` or `grep` output
- if you hit a `>>>` hash mismatch, re-read the file before editing again

**Preconditions:**
- You MUST `read` the file at least once before using `edit` on it
- `edit` will fail with hash mismatches if you haven't read the file recently
- If editing fails with `>>>`, re-`read` the file and try again with fresh anchors

**Prefer `edit` over alternatives:**
- Use `edit` instead of `write` for changes to existing files
- Use `edit` instead of `bash sed`/`awk` for any file modification