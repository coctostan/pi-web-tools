---
id: 8
type: feature
status: done
created: 2026-03-04T21:49:10.708Z
milestone: v2.2
priority: 3
---
# Content freshness control (maxAgeHours)
**Roadmap: 2.2.1** — Quick win.

When searching for docs on a library that just released, stale Exa cache returns outdated info.

**Scope:**
- Add `freshness` param: `"realtime"` (0h), `"day"` (24h), `"week"` (168h), `"any"` (default)
- Maps to Exa's `maxAgeHours`

**Effort:** XS (15 min)
