---
id: 11
type: feature
status: open
created: 2026-03-04T21:49:10.709Z
milestone: v2.2
priority: 3
---
# Search result dedup and noise filtering
**Roadmap: 2.3.2** — Reduce noise in results.

Multiple search results often return the same information.

**Scope:**
- URL dedup (same domain, similar paths)
- Strip common noise from summaries (breadcrumbs, "last updated", etc.)
- ~30 lines of post-processing

**Effort:** S (30 min)
