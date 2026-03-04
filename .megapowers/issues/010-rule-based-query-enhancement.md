---
id: 10
type: feature
status: open
created: 2026-03-04T21:49:10.709Z
milestone: v2.2
priority: 2
---
# Rule-based query enhancement
**Roadmap: 2.3.1** — 35% better first-result retrieval per research.

**Scope:**
- Error message detection: if query looks like a stack trace or error, use Exa's `keyword` search type
- Library version awareness: if detectable, append version to queries about specific libraries
- Vague query expansion: short queries get expanded with related terms
- Rule-based first (no model call needed), ~50 lines
- Show enhanced query in tool result so the agent can see what was actually searched

**Effort:** S (1-2 hours)
