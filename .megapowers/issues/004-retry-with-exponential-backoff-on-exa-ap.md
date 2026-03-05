---
id: 4
type: feature
status: done
created: 2026-03-04T21:48:54.253Z
milestone: v2.1
priority: 2
---
# Retry with exponential backoff on Exa API calls
**Roadmap: 2.1.1** — Reliability improvement.

A single 429 or 503 and the search fails. One retry with a 1s delay recovers most transient failures silently.

**Scope:**
- `retryFetch()` utility: max 2 retries, exponential backoff (1s → 2s)
- Apply to `searchExa()` and `searchContext()`
- Retry on: 429, 500, 502, 503, 504, network errors
- Don't retry on: 400, 401, 403, abort signals

**Effort:** S (< 1 hour)
