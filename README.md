# @coctostan/pi-exa-gh-web-tools

![Pi Web Tools Banner](https://raw.githubusercontent.com/coctostan/pi-exa-gh-web-tools/main/assets/banner-v3.jpg)

Web search, code search, content extraction, and GitHub repo cloning for the [pi](https://github.com/nicholasgasior/pi-coding-agent) coding agent. Powered by [Exa](https://exa.ai).

**Philosophy:** These tools are a filter, not a firehose. Every token entering the main model's context competes with the code the agent is writing. Raw web content is 10–50× larger than it needs to be — this extension aggressively compresses it before it reaches the model.

---

## Install

```bash
pi install npm:@coctostan/pi-exa-gh-web-tools
```

Or from GitHub:

```bash
pi install github:coctostan/pi-exa-gh-web-tools
```

---

## Configuration

### Exa API Key (required for `web_search` and `code_search`)

```bash
export EXA_API_KEY="your-key-here"
```

Or in `~/.pi/web-tools.json`:

```json
{
  "exaApiKey": "your-key-here"
}
```

Environment variable takes precedence.

### Full config reference

Config file: `~/.pi/web-tools.json` — hot-reloaded every 30 seconds, no restart needed.

```json
{
  "exaApiKey": "your-exa-key",
  "filterModel": "anthropic/claude-haiku-4-5",
  "github": {
    "maxRepoSizeMB": 350,
    "cloneTimeoutSeconds": 30,
    "clonePath": "/tmp/pi-github-repos"
  },
  "tools": {
    "web_search": true,
    "code_search": true,
    "fetch_content": true,
    "get_search_content": true
  }
}
```

**`filterModel`** — the cheap model used by `fetch_content`'s `prompt` parameter (see below). Auto-detects `claude-haiku-4-5` then `gpt-4o-mini` if not set. Accepts `"provider/model-id"` format.

**`tools`** — disable individual tools. All enabled by default. `get_search_content` is automatically disabled when all content-producing tools are off.

Override config path:

```bash
export PI_WEB_TOOLS_CONFIG="$HOME/.pi/web-tools.json"
```

---

## Tools

### `web_search`

Search the web. Returns **1-line summaries** by default — just enough to decide what to fetch. Use `detail: "highlights"` for longer excerpts when you need more signal before fetching.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Single search query |
| `queries` | string[] | Batch queries (run in parallel) |
| `numResults` | number | Results per query (default: 5, max: 20) |
| `type` | string | `"auto"` (default, best quality), `"instant"` (sub-150ms), `"deep"` (comprehensive) |
| `detail` | string | `"summary"` (default, ~1 line) or `"highlights"` (3-sentence excerpts) |
| `freshness` | string | `"realtime"` (last 1 hour), `"day"` (last 24h), `"week"` (last 168h), or `"any"` (default, no filter) |
| `category` | string | `"news"`, `"research paper"`, `"company"`, `"tweet"`, `"people"`, `"personal site"`, `"financial report"`, `"pdf"` |
| `includeDomains` | string[] | Only include results from these domains |
| `excludeDomains` | string[] | Exclude results from these domains |
| `similarUrl` | string | Find pages similar to this URL (alternative to `query`). Supports `includeDomains` and `excludeDomains`. Note: `freshness` and `category` are not supported and will produce a warning. |

```ts
// Basic search
web_search({ query: "vitest snapshot testing" })

// Get fresh news
web_search({ query: "TypeScript 5.8 release", freshness: "week", category: "news" })

// More detail when you need it
web_search({ query: "rust async runtime comparison", detail: "highlights" })

// Lock results to specific sites
web_search({ query: "useEffect cleanup", includeDomains: ["react.dev", "github.com"] })

// Batch queries (run in parallel, 3 at a time)
web_search({ queries: ["vitest mocking", "vitest coverage", "vitest browser mode"] })

// Find related pages
web_search({ similarUrl: "https://vitest.dev/guide/" })
```

#### Smart search

Queries are automatically enhanced before hitting Exa:

- **Error/stack trace queries** → forced to `keyword` search type for exact match. A `"Keyword search used."` note appears in the result.
- **Short, vague coding queries** (1–3 words containing a known framework/tool) → expanded with `"docs example"`. A `"Searched as: ..."` note appears in the result.

```ts
// "react" → searches "react docs example"
web_search({ query: "react" })
// Result shows: Searched as: react docs example

// "TypeError: X is not a function" → keyword search
web_search({ query: "TypeError: Cannot read properties of undefined reading 'map'" })
// Result shows: Keyword search used.
```

Results are also deduplicated (same URL with tracking params stripped) and cleaned (breadcrumbs and "last updated" noise removed from snippets).

---

### `fetch_content`

Fetch a URL and extract readable content. Supports regular pages, GitHub repos/files, and PDFs.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Single URL to fetch |
| `urls` | string[] | Multiple URLs (parallel, 3 at a time) |
| `prompt` | string | Question to answer from the page — uses a cheap model to filter, returns ~200–1000 chars instead of the full page |
| `forceClone` | boolean | Force cloning large GitHub repos |

#### The `prompt` parameter (Haiku filter)

The highest-impact way to use this tool. Instead of 10–25K chars of raw page content entering context, a cheap model (Haiku / GPT-4o-mini) reads the page and returns only the answer to your question.

```ts
// Bad: returns 15-25K chars of the full page
fetch_content({ url: "https://vitest.dev/guide/" })

// Good: returns ~500 chars with exactly what you need
fetch_content({
  url: "https://vitest.dev/guide/",
  prompt: "How do I run only a single test file?"
})

// Multiple URLs with same prompt — cheap model calls run in parallel
fetch_content({
  urls: ["https://vitest.dev/config/", "https://vitest.dev/api/"],
  prompt: "What is the default test timeout?"
})
```

If no filter model is available (no API key configured), the raw content is written to a temp file with a preview returned.

#### Raw fetch (file-first)

Without `prompt`, content is written to a temp file. You get a **500-char preview + file path** — use `read` to explore selectively.

```
# Vitest Config Reference
Source: https://vitest.dev/config/

## Configuring Vitest

If you are using Vite and have a `vite.config` file, Vitest will read it to match...

...

Full content saved to /tmp/pi-web-xxx/abc123.txt (42350 chars). Use `read` to explore further.
```

This means the full page is always available — the agent reads only what it needs.

#### GitHub repos

GitHub URLs are automatically detected and handled via clone:

```ts
// Repo tree (file listing + README)
fetch_content({ url: "https://github.com/facebook/react" })

// Specific file
fetch_content({ url: "https://github.com/facebook/react/blob/main/packages/react/src/React.js" })

// Force clone even for large repos
fetch_content({ url: "https://github.com/some/large-repo", forceClone: true })
```

Uses `gh repo clone` when available, falls back to `git clone`. Repos cached in `github.clonePath` (default `/tmp/pi-github-repos`).

#### PDFs

```ts
fetch_content({ url: "https://arxiv.org/pdf/2312.00752" })
```

URLs returning `application/pdf` are auto-detected. Text extracted via `pdf-parse`. Corrupt, encrypted, or empty PDFs return a clear error. PDFs over 5MB are rejected.

---

### `code_search`

Search GitHub repos, documentation, and Stack Overflow for working code examples. Powered by Exa's Context API. Returns formatted snippets, not web pages — better signal-to-noise for code questions than `web_search`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Describe what code you need |
| `tokensNum` | number | Response size in tokens (default: auto, range: 50–100,000) |

```ts
code_search({ query: "vitest mock fetch with MSW" })
code_search({ query: "React Server Components with Next.js app router", tokensNum: 5000 })
code_search({ query: "how to use vercel ai sdk streaming with claude" })
```

---

### `get_search_content`

Retrieve full stored content from a previous tool call. Every `web_search`, `fetch_content`, and `code_search` result is kept in memory for the session with a `responseId`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `responseId` | string | ID from a previous tool result |
| `query` | string | Retrieve by query text (for `web_search` results) |
| `queryIndex` | number | Retrieve by query position (0-indexed) |
| `url` | string | Retrieve by URL (for `fetch_content` results) |
| `urlIndex` | number | Retrieve by URL position (0-indexed) |
| `maxChars` | number | Max characters to return (default: 30,000, max: 100,000) |

```ts
// Retrieve a specific search query result
get_search_content({ responseId: "abc123", queryIndex: 0 })

// Retrieve a specific URL from a multi-URL fetch
get_search_content({ responseId: "xyz789", url: "https://vitest.dev/api/" })

// Get a larger slice of content
get_search_content({ responseId: "abc123", queryIndex: 0, maxChars: 80000 })
```

---

## How it protects your context

Raw web content left unchecked will rot your context. The tools apply three layers of compression:

**1. Haiku filter (`fetch_content` + `prompt`)**
The single highest-impact feature. A cheap model reads the full page and returns only the answer to your question. 10–50× context reduction. Costs ~$0.001–0.005 per call — pays for itself instantly in saved Sonnet/Opus input tokens.

**2. Summary-first search (`web_search`)**
`web_search` returns one-line summaries by default — just enough to identify which URL to fetch. Old behavior (long highlights) available via `detail: "highlights"` when you need more signal without fetching.

**3. File-first raw fetch**
Raw `fetch_content` results (without `prompt`) always write to a temp file. Only a 500-char preview enters context. Use `read` to access the file selectively — grep, read ranges, or read specific symbols. Temp files are cleaned up on session shutdown.

**4. Result storage + `get_search_content`**
All results are stored in-memory for the session. `get_search_content` lets you retrieve any previous result with configurable size limits.

---

## Network resilience

All Exa API calls retry automatically on transient failures:

- **Retries:** max 2, exponential backoff (1s → 2s)
- **Retried:** 429 (rate limit), 500, 502, 503, 504, network errors
- **Not retried:** 400, 401, 403, 404, abort signals

Fetched URLs are deduplicated within a session — the same URL won't be fetched twice in the same session. Multi-URL `fetch_content` calls use `p-limit(3)` for parallel fetching. Batch `web_search` queries also run in parallel with `p-limit(3)`.

---

## Development

```bash
npm install
npm test           # 198 tests via vitest
npm run test:watch # watch mode

# Load in pi for manual testing
pi -e ./index.ts
```

Tests use mocked network calls — no Exa API key needed.

---

## Changelog

### 2.0.0

Complete architectural overhaul — the tools now filter content before it enters context, not after.

**Context compression:**
- `fetch_content` gains a `prompt` parameter: content is sent through a cheap model (Haiku / GPT-4o-mini), returning only the focused answer (~200–1000 chars vs. 10–25K raw). Falls back to raw if no filter model is configured.
- `web_search` now returns 1-line summaries by default (was: 3-sentence highlights). Use `detail: "highlights"` to restore old behavior.
- Raw `fetch_content` (no `prompt`) now always writes to a temp file and returns a preview + path. Use `read` to explore. (Was: inline up to 30K, then offload.)

**New search features:**
- `web_search` gains `freshness` parameter: `"realtime"`, `"day"`, `"week"`, `"any"`.
- `web_search` gains `similarUrl` parameter: find pages similar to a given URL (maps to Exa `/findSimilar`).
- `web_search` gains `detail` parameter: `"summary"` (default) or `"highlights"`.
- Smart query enhancement: vague 1–3 word coding queries automatically expanded with "docs example"; error/stack trace queries forced to keyword search. Both shown transparently in the result.
- Result deduplication: same URLs (after stripping tracking params) removed; snippet noise cleaned.

**Reliability:**
- All Exa API calls now retry on transient failures (max 2 retries, exponential backoff: 1s → 2s).
- Session-level URL cache: same URL won't be fetched twice in a session.
- Batch `web_search` queries run in parallel via `p-limit(3)` (was: sequential).

### 1.2.0

- **PDF text extraction**: `fetch_content` extracts readable text from PDF URLs via `pdf-parse`.
- **`get_search_content` size guardrails**: `maxChars` parameter (default 30K, hard cap 100K).
- **Dynamic file offloading**: tool results >30K chars written to temp file with preview returned.

### 1.1.0

- Initial release: `web_search`, `code_search`, `fetch_content`, `get_search_content`.

---

## License

MIT
