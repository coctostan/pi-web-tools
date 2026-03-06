---
id: 9
type: feature
status: done
created: 2026-03-04T21:49:10.709Z
milestone: v2.2
priority: 3
---
# findSimilar support for web_search
**Roadmap: 2.2.2** — New capability.

"Find pages similar to this URL" is useful when the agent finds one good doc page and wants related content.

**Scope:**
- Add `similarUrl` param to `web_search` (alternative to `query`)
- Maps to Exa's `POST /findSimilar` endpoint
- Same return format as regular search

**Effort:** S (30 min)
