# pi-web-tools Roadmap

> Goal: Best web search tooling for agentic coding in pi.  
> Current: v2.0.0 — stable, working, 198 tests green.  
> North star: The tools should be a filter, not a firehose. Every token entering the main model's context competes with the code the agent is writing.

---

## ✅ Shipped — v2.0 through v2.3

All of the original v2 architecture is complete:

- **v2.0** — Haiku filter on `fetch_content`, lean summary-first search, file-first content storage
- **v2.1** — Retry/backoff on all Exa calls, parallel batch search, session-level URL cache, cleanup
- **v2.2** — Content freshness control (`freshness` param), `findSimilar` support
- **v2.3** — Smart query enhancement, search result dedup/noise filtering

---

## Next — v3.0: Composability & Efficiency

**Theme: Make web-tools a first-class data source for PTC and the broader agent ecosystem.**

### 3.0.1 — Structured ptcValue for PTC interop (#022)

**Why:** PTC's `tool-adapters.ts` already checks for `details.ptcValue` on every tool result. When present, Python code inside `code_execution` gets structured data instead of parsing human-readable text. Currently web-tools returns text-only, forcing PTC to fall back to string parsing.

**Scope:**
- Add `details.ptcValue` to all 4 tool executors (`web_search`, `fetch_content`, `code_search`, `get_search_content`)
- Add `ptc` metadata (`callable: true`, `policy: "read-only"`) to tool definitions
- Define stable structured shapes for each tool's output
- **Effort:** S-M (2-4 hours)

### 3.0.2 — Multi-source parallel fetch with per-source filtering (#023)

**Why:** When an agent needs to cross-reference 3 sources, the current flow is serial fetch → full content in context → repeat. This bloats context by 30k+ tokens per source. Multi-source parallel fetch with per-source Haiku filtering reduces that to ~200-1000 chars per source — ~90% token savings.

**Scope:**
- `fetch_content` with `urls` array + `prompt` → parallel fetch all URLs
- Each source independently Haiku-filtered with the same prompt
- Return structured array of per-source focused answers
- Per-source failures don't block others
- Agent does synthesis/comparison — extension just provides compact extraction
- **Effort:** M (2-3 hours)

### 3.0.3 — Persistent TTL-based research cache (#024)

**Why:** Agents frequently look up the same docs with the same questions across sessions. Today every lookup re-fetches and re-filters. A TTL cache eliminates both for repeated queries.

**Scope:**
- Cache key: `URL + prompt + model` (no network needed to check)
- Default TTL: 24h (configurable in `web-tools.json`)
- Disk-persistent (survives sessions)
- `freshness: "force"` to bypass cache
- **Effort:** M (2-3 hours)

---

## Later / When Needed

These are real features but not needed yet. Revisit when pain is felt.

| Item | Why later |
|------|-----------|
| **Browser rendering (Playwright)** | With the Haiku filter, even poorly-extracted pages yield useful answers. Only needed if JS-heavy page extraction becomes a frequent blocker. |
| **GitHub API for single-file reads** | Current clone approach works. Only worth it if cloning repos just to read one file. |
| **Alternative search providers (Brave)** | Exa works and is cheap. Only if Exa becomes unreliable or you hit rate limits. |
| **Doc contract extraction** | `fetch_content` with a good prompt already handles this. Build a first-class mode only if Forge proves the pattern needs it. |
| **Streaming progress (`_onUpdate`)** | Less important when results are smaller and faster. |

---

## Not Doing

| Item | Why not |
|------|---------|
| Deep search (`type: "deep"`) | Too expensive, no clear use case for coding workflow |
| Full-site crawling | Scope creep. Search + fetch specific pages is the right abstraction. |
| Content summarization via main model | The Haiku filter IS this, but cheaper and without adding latency to the main loop |
| Image/screenshot extraction | Niche for coding agents |
| Reasoning/comparison inside the extension | Agent does synthesis. Extension provides compact, structured inputs. |

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
