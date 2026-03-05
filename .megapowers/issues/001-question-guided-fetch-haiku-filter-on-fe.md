---
id: 1
type: feature
status: open
created: 2026-03-04T21:48:37.799Z
milestone: v2.0
priority: 1
---
# Question-guided fetch (Haiku filter) on fetch_content
**Roadmap: 2.0.1** — The single highest-impact change.

Add a `prompt` parameter to `fetch_content`. When provided, the fetched page is sent through a cheap model (Haiku / GPT-4o-mini) with the specific question. Only the answer enters the main model's context.

**Why:** 10-50x context reduction per fetch. ~$0.003-0.005 per call on Haiku.

**Scope:**
- Add `prompt` param to `fetch_content` tool schema
- After extraction: if `prompt` is set, call cheap model via `complete()` with page content + question
- Return focused answer (~200-1000 chars) instead of raw content (~5-30K chars)
- Fallback: if no cheap model API key available, return raw content with warning
- Config: `web-tools.json` → `"filterModel": "anthropic/claude-haiku-4-5"` with override
- Auto-detect available cheap model: try Haiku → GPT-4o-mini → raw fallback
- System prompt guidance: nudge agent to prefer `prompt` parameter via tool description
- Multi-URL: parallelize cheap model calls with `p-limit(3)`

**Effort:** M (2-3 hours)
