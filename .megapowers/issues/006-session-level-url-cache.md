---
id: 6
type: feature
status: done
created: 2026-03-04T21:48:54.255Z
milestone: v2.1
priority: 2
---
# Session-level URL cache
**Roadmap: 2.1.3** — Avoid redundant fetches.

Same URL fetched twice = two network requests. With the Haiku filter, cached content can answer new questions about the same page without re-fetching.

**Scope:**
- Before fetching, check stored results for matching URL < 30 min old
- If found, return cached version (and run Haiku filter on it if new `prompt`)
- Add `cache: "no-cache"` parameter to force refetch

**Effort:** S (1 hour)
