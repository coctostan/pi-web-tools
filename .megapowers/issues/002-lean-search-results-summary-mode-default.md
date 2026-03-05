---
id: 2
type: feature
status: done
created: 2026-03-04T21:48:37.799Z
milestone: v2.0
priority: 1
---
# Lean search results (summary mode default)
**Roadmap: 2.0.2** — Reduce search result bloat.

Current `web_search` returns Exa highlights (3 sentences × 3 per URL) = 5-15K tokens per search, most unused.

**Scope:**
- Switch Exa `contents` from `highlights` to `summary` mode by default
- Return: title, URL, 1-line summary per result (~1-2K total vs. 5-15K)
- Add `detail` parameter: `"summary"` (default) or `"highlights"` for when the agent wants more
- Agent sees what's available, then uses prompt-mode `fetch_content` for what matters

**Effort:** S (1 hour)
