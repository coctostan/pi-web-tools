Read files and return anchored output that can be used by `edit`.

**Use when:**
- you need file content, targeted line ranges, or symbol-scoped reads
- you want anchors that can be fed back into `edit`

**Prefer over:**
- `bash` or `cat` for normal file reading
- broad full-file reads when `offset`, `limit`, `symbol`, or `map` can narrow the scope

**Tips:**
- use `symbol` to jump straight to a function, class, or method without line numbers
- use `map: true` when you need a structural overview before targeted reads
- anchored output from normal reads and symbol reads is valid input for `edit`

**Prefer `read` over bash alternatives:**
- Use `read` instead of `bash cat` — it provides anchored output usable by `edit`
- Use `read` with `offset`/`limit` instead of `bash head`/`tail`
- Use `read` with `symbol` instead of bash pipelines to extract functions