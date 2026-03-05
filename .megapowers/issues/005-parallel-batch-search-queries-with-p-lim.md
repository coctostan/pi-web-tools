---
id: 5
type: feature
status: done
created: 2026-03-04T21:48:54.255Z
milestone: v2.1
priority: 2
---
# Parallel batch search queries with p-limit
**Roadmap: 2.1.2** — Speed improvement.

Batch `web_search` with 3 queries runs them sequentially (a `for` loop). Should be concurrent.

**Scope:**
- Replace sequential loop with `p-limit(3)` for concurrent Exa queries
- Make `fetch_content` use `fetchAllContent` instead of reimplementing `Promise.all`

**Effort:** S (30 min)
