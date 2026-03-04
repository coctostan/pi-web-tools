# pi-web-tools Roadmap

> Goal: Best web search tooling for agentic coding in pi.  
> Current: v1.2.0 — stable, working, 110 tests green.  
> North star: The tools should be a filter, not a firehose. Every token entering the main model's context competes with the code the agent is writing.

---

## v2.0 — Context-Aware Architecture

**Theme: Stop dumping raw web content into the main model's context window.**

Research is clear: context rot is the #1 failure mode in agentic coding. Models get worse as irrelevant content accumulates. Claude Code solved this by never returning raw pages — it pre-filters through Haiku. Cursor solved it by writing content to files and letting the agent read selectively. pi-web-tools should do both.

### 2.0.1 — Question-guided fetch (the Haiku filter)

**The single highest-impact change.** Add a `prompt` parameter to `fetch_content`. When provided, the fetched page is sent through a cheap model (Haiku / GPT-4o-mini) with the specific question. Only the answer enters the main model's context.

**Why:** 10-50x context reduction per fetch. The main model's attention stays on code, not on doc page noise. Costs ~$0.003-0.005 per call on Haiku — pays for itself instantly in saved Sonnet/Opus input tokens.

**How it works in pi:** Extensions can call `complete()` from `@mariozechner/pi-ai` and access API keys via `ctx.modelRegistry.getApiKey()`. The `summarize.ts` example extension already demonstrates this exact pattern.

**Scope:**
- Add `prompt` param to `fetch_content` tool schema
- After extraction: if `prompt` is set, call cheap model via `complete()` with page content + question
- Return the model's focused answer (~200-1000 chars) instead of raw content (~5-30K chars)
- Fallback: if no cheap model API key is available, return raw content with a warning
- Config: `web-tools.json` → `"filterModel": "anthropic/claude-haiku-4-5"` with override
- Auto-detect available cheap model: try Haiku → GPT-4o-mini → raw fallback
- System prompt guidance: nudge the agent to prefer `prompt` parameter via tool description
- Multi-URL: parallelize cheap model calls with `p-limit(3)` when multiple URLs fetched with same prompt
- **Effort:** M (2-3 hours)

### 2.0.2 — Lean search results

**Why:** Current `web_search` returns Exa highlights (3 sentences × 3 per URL) for every result — 5-15K tokens entering context on every search, most of which the agent never uses. Claude Code's WebSearch returns only titles + URLs.

**Scope:**
- Switch Exa `contents` from `highlights` to `summary` mode by default
- Return: title, URL, 1-line summary per result (~1-2K total vs. 5-15K)
- Add `detail` parameter: `"summary"` (default) or `"highlights"` for when the agent wants more
- The agent sees what's available, then uses prompt-mode `fetch_content` for what matters
- **Effort:** S (1 hour)

### 2.0.3 — File-first content storage

**Why:** When `fetch_content` is called without `prompt` (raw mode), content currently goes inline up to 30K, then offloads above that. This is a weird threshold — Cursor just always writes to a file and gives the agent a preview + path. The agent already has `read` as a built-in tool for random access.

**Scope:**
- All raw fetches (without `prompt`) → write to temp file
- Return: title + URL + first 500 chars as preview + file path
- Remove the 30K inline threshold entirely — it's always a file
- Agent uses `read` to dig deeper, can grep, read specific ranges
- Clean up temp files on session shutdown
- **Effort:** S (1-2 hours)

---

## v2.1 — Reliability & Speed

**Theme: The architecture is right, now make it robust.**

### 2.1.1 — Retry with backoff on Exa API calls

**Why:** A single 429 or 503 and the search fails. One retry with a 1s delay recovers most transient failures silently.

**Scope:**
- `retryFetch()` utility: max 2 retries, exponential backoff (1s → 2s)
- Apply to `searchExa()` and `searchContext()`
- Retry on: 429, 500, 502, 503, 504, network errors
- Don't retry on: 400, 401, 403, abort signals
- **Effort:** S (< 1 hour)

### 2.1.2 — Parallel batch search queries

**Why:** Batch `web_search` with 3 queries runs them sequentially (a `for` loop). Should use `p-limit(3)` like `fetchAllContent` does.

**Scope:**
- Replace sequential loop with `p-limit(3)` for concurrent Exa queries
- Make `fetch_content` use `fetchAllContent` instead of reimplementing `Promise.all`
- **Effort:** S (30 min)

### 2.1.3 — Session-level URL cache

**Why:** Same URL fetched twice = two network requests. With the Haiku filter, cached content can answer new questions about the same page without re-fetching.

**Scope:**
- Before fetching, check stored results for matching URL < 30 min old
- If found, return cached version (and run Haiku filter on it if new `prompt`)
- Add `cache: "no-cache"` parameter to force refetch
- **Effort:** S (1 hour)

### 2.1.4 — Cleanup pass

**Scope:**
- Remove `sessionActive` dead code
- Delete or update stale `todo.md`
- Centralize magic numbers into `constants.ts`
- Convert sync fs ops in `github-extract.ts` to async
- **Effort:** S (1 hour)

---

## v2.2 — Exa Feature Unlocks

**Theme: Use more of what you're already paying for.**

### 2.2.1 — Content freshness control (`maxAgeHours`)

**Why:** When searching for docs on a library that just released, stale Exa cache returns outdated info.

**Scope:**
- Add `freshness` param: `"realtime"` (0h), `"day"` (24h), `"week"` (168h), `"any"` (default)
- Maps to Exa's `maxAgeHours`
- **Effort:** XS (15 min)

### 2.2.2 — `findSimilar` support

**Why:** "Find pages similar to this URL" is useful when the agent finds one good doc page and wants related content.

**Scope:**
- Add `similarUrl` param to `web_search` (alternative to `query`)
- Maps to Exa's `POST /findSimilar` endpoint
- Same return format as regular search
- **Effort:** S (30 min)

---

## v2.3 — Intelligent Search

**Theme: Make the search queries better, not just the results.**

### 2.3.1 — Query enhancement

**Why:** Research shows query reformulation alone gives 35% better first-result retrieval. The agent's initial query is often too vague or too specific.

**Scope:**
- Error message detection: if query looks like a stack trace or error, use Exa's `keyword` search type
- Library version awareness: if detectable, append version to queries about specific libraries
- Vague query expansion: short queries get expanded with related terms
- Rule-based first (no model call needed), ~50 lines
- Show enhanced query in tool result so the agent can see what was actually searched
- **Effort:** S (1-2 hours)

### 2.3.2 — Search result dedup and noise filtering

**Why:** Multiple search results often return the same information. Post-processing can reduce noise.

**Scope:**
- URL dedup (same domain, similar paths)
- Strip common noise from summaries (breadcrumbs, "last updated", etc.)
- ~30 lines of post-processing
- **Effort:** S (30 min)

---

## Later / When Needed

These are real features but not needed yet. Revisit when pain is felt.

| Item | Why later |
|------|-----------|
| **Persistent cross-session cache** | Session cache (2.1.3) comes first. Revisit if you find yourself re-researching the same topics. |
| **Browser rendering (Playwright)** | With the Haiku filter, even poorly-extracted pages yield useful answers. Only needed if JS-heavy page extraction becomes a frequent blocker. |
| **GitHub API for single-file reads** | Current clone approach works for your usage. Only worth it if you're cloning repos just to read one file. |
| **Alternative search providers (Brave)** | Exa works and is cheap. Only if Exa becomes unreliable or you hit rate limits. |
| **Doc site extractors** | The Haiku filter handles extraction noise. Less important now. |
| **Streaming progress (`_onUpdate`)** | Less important when results are smaller and faster. |

---

## Not Doing

| Item | Why not |
|------|---------|
| Deep search (`type: "deep"`) | Too expensive, no clear use case for coding workflow |
| Full-site crawling | Scope creep. Search + fetch specific pages is the right abstraction. |
| Content summarization via main model | The Haiku filter IS this, but cheaper and without adding latency to the main loop |
| Image/screenshot extraction | Niche for coding agents |
| CI/CD, CONTRIBUTING.md, open-source polish | Personal tool, not a community project |
| `index.ts` decomposition | Works fine. Refactor when adding a 5th tool, not before. |

---

## Priority Matrix

| Item | Effort | Impact | Do When |
|------|--------|--------|---------|
| 2.0.1 Haiku filter | M | **Massive** (10-50x context reduction) | **First** |
| 2.0.2 Lean search | S | **High** (5-15K → 1-2K per search) | **First** |
| 2.0.3 File-first storage | S | **High** (eliminates inline bloat) | **First** |
| 2.1.1 Retry/backoff | S | High (reliability) | **Second** |
| 2.1.2 Parallel batch | S | Medium (speed) | **Second** |
| 2.1.3 URL cache | S | High (speed + enables prompt re-use) | **Second** |
| 2.1.4 Cleanup | S | Low (hygiene) | **Second** |
| 2.2.1 maxAgeHours | XS | Medium (freshness) | Quick win |
| 2.2.2 findSimilar | S | Medium (new capability) | When useful |
| 2.3.1 Query enhancement | S | High (35% better retrieval per research) | **Third** |
| 2.3.2 Result dedup | S | Low-Medium | When noisy |

**S** = small (< 1 hour) · **M** = medium (2-4 hours) · **XS** = trivial (< 15 min)

---

## Execution Plan

**Sprint 1 — The Architecture Shift** (one afternoon)
- 2.0.1: Haiku filter on `fetch_content`
- 2.0.2: Switch to summary mode on `web_search`
- 2.0.3: File-first content storage

Ship as v2.0.0. This is the version where the tools stop being a firehose.

**Sprint 2 — Hardening** (one afternoon)
- 2.1.1 + 2.1.2 + 2.1.3 + 2.1.4 together
- All small, all independent

Ship as v2.1.0.

**Sprint 3 — Smart Search** (a few hours)
- 2.2.1 (maxAgeHours, trivial)
- 2.3.1 (query enhancement)
- 2.2.2 + 2.3.2 if time

Ship as v2.2.0.

---

## References

- [pi-web-tools-assessment.md](../explorations/pi-web-tools-assessment.md) — initial code review
- [pi-web-tools-ideal-design.md](../explorations/pi-web-tools-ideal-design.md) — research findings
- [pi-web-tools-v2-design.md](pi-web-tools-v2-design.md) — detailed v2 architecture rationale
- Claude Code WebFetch/WebSearch internals: https://mikhail.io/2025/10/claude-code-web-tools/
- Dynamic filtering: https://claude.com/blog/improved-web-search-with-dynamic-filtering
- Cursor dynamic context discovery: https://cursor.com/blog/dynamic-context-discovery
- Search bottleneck research: https://www.morphllm.com/blog/code-search-bottleneck
- Agent design patterns: https://rlancemartin.github.io/2026/01/09/agent_design/
- Exa API best practices: https://docs.exa.ai/reference/exas-capabilities-explained
