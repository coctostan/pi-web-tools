# @coctostan/pi-exa-gh-web-tools

Web search, code search, content extraction, and GitHub repo cloning for the [Pi coding agent](https://github.com/nicholasgasior/pi-coding-agent), powered by [Exa](https://exa.ai).

This package gives Pi four tools:

- `web_search` — search the web and return compact results
- `code_search` — find code examples from docs, GitHub, and Stack Overflow
- `fetch_content` — fetch a URL, GitHub repo/file, or PDF and extract readable content
- `get_search_content` — retrieve stored content from an earlier tool call

## Why this exists

Most web pages are too large and noisy to drop directly into an agent's context window. This extension is designed to keep Pi focused:

- `web_search` returns short summaries by default
- `fetch_content` can answer a specific question instead of returning a whole page
- raw fetched content is written to a temp file instead of flooding context
- previous results are stored and can be retrieved later

If you're new to Pi, the simplest mental model is:

1. **Search** for a good source
2. **Fetch** only the page you need
3. **Ask a focused question** when possible
4. **Read the saved file** only if you need the raw content

## Quick start

### 1) Install the extension in Pi

From npm:

```bash
pi install npm:@coctostan/pi-exa-gh-web-tools
```

Or directly from GitHub:

```bash
pi install github:coctostan/pi-web-tools
```

### 2) Configure your Exa API key

`web_search` and `code_search` require an Exa API key.

Set it as an environment variable:

```bash
export EXA_API_KEY="your-key-here"
```

Or put it in `~/.pi/web-tools.json`:

```json
{
  "exaApiKey": "your-key-here"
}
```

Environment variables take precedence over the config file.

### 3) Start using the tools

Typical beginner flow:

```ts
web_search({ query: "vitest mock fetch" })
fetch_content({
  url: "https://vitest.dev/guide/mocking.html",
  prompt: "How do I mock a function in Vitest?"
})
```

## 30-second example

If you've never used Pi tools before, this is the shortest useful workflow:

```ts
// 1) Find a good source
web_search({ query: "vitest retry failed test" })

// 2) Ask one page a focused question
fetch_content({
  url: "https://vitest.dev/guide/",
  prompt: "How do I retry a failed test?"
})
```

Rule of thumb:

- use `web_search` to **choose a source**
- use `fetch_content({ prompt })` to **get an answer**
- use `fetch_content({ url })` without `prompt` only when you really need the raw page

## What each tool does

## Which tool should I use?

| If you want to... | Use this |
|---|---|
| Find a relevant page or article | `web_search` |
| Find a working code snippet | `code_search` |
| Ask one URL a specific question | `fetch_content({ url, prompt })` |
| Read the full raw content of a page | `fetch_content({ url })` |
| Re-open an earlier result without refetching | `get_search_content` |

For most Pi sessions, this is the best default path:

1. `web_search`
2. `fetch_content({ prompt })`
3. `get_search_content` or `read` only if you need more detail

### `web_search`

Search the web and return **1-line summaries** by default.

Use it when you want to decide **which URL is worth reading next**.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Single search query |
| `queries` | `string[]` | Multiple search queries |
| `numResults` | `number` | Results per query, default `5`, max `20` |
| `type` | `string` | `"auto"` (default), `"instant"`, or `"deep"` |
| `detail` | `string` | `"summary"` (default) or `"highlights"` |
| `freshness` | `string` | `"realtime"`, `"day"`, `"week"`, or `"any"` |
| `category` | `string` | Content category filter |
| `includeDomains` | `string[]` | Only include these domains |
| `excludeDomains` | `string[]` | Exclude these domains |
| `similarUrl` | `string` | Find pages similar to a URL |

#### Examples

```ts
// Basic search
web_search({ query: "vitest snapshot testing" })

// Get more detail before fetching
web_search({ query: "rust async runtime comparison", detail: "highlights" })

// Restrict results to specific sites
web_search({ query: "useEffect cleanup", includeDomains: ["react.dev", "github.com"] })

// Batch search
web_search({ queries: ["vitest mocking", "vitest coverage", "vitest browser mode"] })

// Find related pages
web_search({ similarUrl: "https://vitest.dev/guide/" })
```

#### Smart search behavior

The tool automatically improves certain queries before sending them to Exa:

- stack traces and error messages switch to keyword search
- short vague coding queries may expand to include `docs example`
- duplicate URLs are removed
- snippet noise like breadcrumbs and tracking params is cleaned up

### `fetch_content`

Fetch a page, GitHub repo/file, or PDF and return readable content.

Use it when you already know **which source you want to inspect**.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Single URL to fetch |
| `urls` | `string[]` | Multiple URLs to fetch |
| `prompt` | `string` | Ask a question about the content instead of returning the whole page |
| `forceClone` | `boolean` | Force clone for large GitHub repos |
| `noCache` | `boolean` | Skip research cache and fetch fresh (still updates cache) |

#### Best practice for Pi beginners

Prefer `prompt` whenever you can.

```ts
fetch_content({
  url: "https://vitest.dev/guide/",
  prompt: "How do I run only one test file?"
})
```

That returns a focused answer instead of dumping a large page into context.

#### Raw fetch behavior

Without `prompt`, content is written to a temp file and the tool returns:

- a short preview
- the temp file path
- the total content size

This keeps Pi's context smaller while preserving access to the full content.

#### GitHub support

GitHub URLs are detected automatically.

```ts
// Repo tree + README summary
fetch_content({ url: "https://github.com/facebook/react" })

// Specific file
fetch_content({ url: "https://github.com/facebook/react/blob/main/packages/react/src/React.js" })
```

The tool tries `gh repo clone` first, then falls back to `git clone`.

#### PDF support

```ts
fetch_content({ url: "https://arxiv.org/pdf/2312.00752" })
```

PDF text is extracted with `pdf-parse`. Corrupt, encrypted, empty, or oversized PDFs return a clear error.

### `code_search`

Search for working code examples from docs, GitHub repositories, and Stack Overflow.

Use it when you want **code patterns**, not general web pages.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Describe what code you want |
| `tokensNum` | `number` | Response size in tokens |

#### Examples

```ts
code_search({ query: "vitest mock fetch with MSW" })
code_search({ query: "React Server Components with Next.js app router", tokensNum: 5000 })
```

### `get_search_content`

Retrieve stored content from an earlier `web_search`, `fetch_content`, or `code_search` call.

This is useful when you want to revisit a result without repeating the network request.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `responseId` | `string` | ID returned by an earlier tool call |
| `query` | `string` | Retrieve a `web_search` result by query |
| `queryIndex` | `number` | Retrieve a `web_search` result by position |
| `url` | `string` | Retrieve a `fetch_content` result by URL |
| `urlIndex` | `number` | Retrieve a `fetch_content` result by position |
| `maxChars` | `number` | Maximum response size, default `30000`, max `100000` |

#### Examples

```ts
get_search_content({ responseId: "abc123", queryIndex: 0 })
get_search_content({ responseId: "xyz789", url: "https://vitest.dev/api/" })
```

## Configuration

The package reads config from `~/.pi/web-tools.json` and hot-reloads it every 30 seconds.

### Full config example
{
  "exaApiKey": "your-exa-key",
  "filterModel": "anthropic/claude-haiku-4-5",
  "cacheTTLMinutes": 1440,
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

### Config options

| Setting | Description |
|---------|-------------|
| `exaApiKey` | Exa API key used by `web_search` and `code_search` |
| `filterModel` | Cheap model used by `fetch_content({ prompt })` |
| `github.maxRepoSizeMB` | Max GitHub repo size before refusing or requiring force clone |
| `github.cloneTimeoutSeconds` | Clone timeout |
| `github.clonePath` | Cache directory for cloned repos |
| `tools.*` | Enable or disable individual tools |
| `cacheTTLMinutes` | TTL in minutes for the persistent research cache (default: `1440` = 24h) |

To use a different config path:

```bash
export PI_WEB_TOOLS_CONFIG="$HOME/.pi/web-tools.json"
```

## How this package protects context

This package is opinionated about token efficiency.

### 1. Summary-first search

`web_search` returns short summaries by default so the main model only sees enough to choose a source.

### 2. Question-guided fetching

`fetch_content({ prompt })` lets a cheaper model read the full page and return only the answer to your question.

### 3. File-first raw content

Raw fetched content is offloaded to a temp file instead of being pasted inline.

### 4. Stored results

Search and fetch results stay available for the session through `get_search_content`.

## Network resilience

All Exa API requests use retry logic for transient failures.

- retries: max 2
- backoff: `1s -> 2s`
- retried: `429`, `500`, `502`, `503`, `504`, and network errors
- not retried: `400`, `401`, `403`, `404`, and abort signals

The package also:

- deduplicates repeated URL fetches within a session
- runs multi-URL fetches with `p-limit(3)`
- runs batch web searches with `p-limit(3)`

## Development

Clone the repo:

```bash
git clone git@github.com:coctostan/pi-web-tools.git
cd pi-web-tools
npm install
```

Run tests:

```bash
npm test
```

Watch tests while developing:

```bash
npm run test:watch
```

Load the extension in Pi for manual testing:

```bash
pi -e ./index.ts
```

Tests use mocked network calls, so they do not require an Exa API key.

## Troubleshooting

### `web_search` or `code_search` fails immediately

Usually this means your Exa API key is missing or invalid.

Check:

```bash
echo "$EXA_API_KEY"
```

Or verify `~/.pi/web-tools.json` contains:

```json
{
  "exaApiKey": "your-key-here"
}
```

### `fetch_content` returned a file path instead of an answer

That is expected when you do **not** provide `prompt`, or when no cheap filter model is available.

Use:

```ts
fetch_content({
  url: "https://example.com",
  prompt: "What does this page say about X?"
})
```

### I got too much text back

Try this order:

1. use `web_search` first
2. use `fetch_content({ prompt })` instead of raw fetch
3. only read the saved temp file if you need the original page

### GitHub fetches are slow or fail on large repos

Try:

```ts
fetch_content({
  url: "https://github.com/owner/repo",
  forceClone: true
})
```

Also make sure `gh` or `git` is available on your machine.

## Maintainer release checklist

The repo is currently at package version `2.0.0`. If npm still shows an older version, use this checklist before publishing:

```bash
npm test
npm pack --dry-run
npm publish --access public
```

Before publishing, confirm:

- `package.json` version is correct
- repository, homepage, and bugs URLs point to the live repo
- `README.md` reflects the current feature set
- the dry-run tarball only contains the intended files

Current package metadata points to this repo:

- Repository: `https://github.com/coctostan/pi-web-tools`
- Issues: `https://github.com/coctostan/pi-web-tools/issues`
- README/Homepage: `https://github.com/coctostan/pi-web-tools#readme`

## Project structure

```text
index.ts           Pi extension entry point and tool registration
exa-search.ts      Exa web search integration
exa-context.ts     Exa code/context search integration
extract.ts         HTML/PDF content extraction
github-extract.ts  GitHub repo and file handling
filter.ts          Cheap-model filtering for focused answers
research-cache.ts  Persistent TTL-based research cache
storage.ts         Session result storage
config.ts          Config loading and hot reload
tool-params.ts     Tool input normalization and validation
retry.ts           Retry and backoff helpers
offload.ts         Temp-file offload for raw content
smart-search.ts    Query enhancement and deduplication
truncation.ts      Response truncation helpers
constants.ts       Shared constants (timeouts, TTLs)
```

## Changelog

### 3.0.0

- `fetch_content` gained persistent research cache — repeated prompt+URL lookups return instant cached answers
- `fetch_content` gained `noCache` param to bypass cache
- `cacheTTLMinutes` config option (default 24h)
- `details.ptcValue` on all 4 tools for PTC interop
- multi-URL+prompt ptcValue shape cleaned up

### 2.0.0
- `fetch_content` gained `prompt` for focused question answering
- `web_search` now returns summary-first results by default
- raw fetches are always offloaded to temp files
- `web_search` gained `freshness`, `similarUrl`, and `detail`
- smart query enhancement and result deduplication were added
- retry logic, URL caching, and parallel batch processing were improved

### 1.2.0

- PDF extraction in `fetch_content`
- `get_search_content.maxChars`
- dynamic file offloading for large content

### 1.1.0

- initial release of `web_search`, `code_search`, `fetch_content`, and `get_search_content`

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
