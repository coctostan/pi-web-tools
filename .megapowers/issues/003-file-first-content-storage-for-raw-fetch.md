---
id: 3
type: feature
status: done
created: 2026-03-04T21:48:37.800Z
milestone: v2.0
priority: 1
---
# File-first content storage for raw fetches
**Roadmap: 2.0.3** — Eliminate inline content bloat.

When `fetch_content` is called without `prompt` (raw mode), content currently goes inline up to 30K. Instead, always write to a temp file and return a preview.

**Scope:**
- All raw fetches (without `prompt`) → write to temp file
- Return: title + URL + first 500 chars as preview + file path
- Remove the 30K inline threshold entirely — it's always a file
- Agent uses `read` to dig deeper, can grep, read specific ranges
- Clean up temp files on session shutdown

**Effort:** S (1-2 hours)
