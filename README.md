# pi-web-tools

Web search, content extraction, and GitHub repo cloning for the [Pi coding agent](https://github.com/nicholasgasior/pi-coding-agent).

A lightweight extension providing three tools:

- **`web_search`** — Search the web via [Exa](https://exa.ai) with snippet extraction
- **`fetch_content`** — Fetch any URL and extract clean markdown (HTML via Readability, Jina Reader fallback, GitHub via clone)
- **`get_search_content`** — Retrieve stored results from previous searches/fetches

## Install

```bash
pi install npm:pi-web-tools
```

Or install from git:

```bash
pi install github:USER/pi-web-tools
```

## Setup

### Exa API Key (required for web_search)

Get a key at [exa.ai](https://exa.ai) and set it via environment variable:

```bash
export EXA_API_KEY="your-key-here"
```

Or add it to the config file `~/.pi/web-tools.json`:

```json
{
  "exaApiKey": "your-key-here"
}
```

The environment variable takes precedence over the config file.

### GitHub CLI (recommended for fetch_content)

For GitHub repo cloning, install the [GitHub CLI](https://cli.github.com/):

```bash
# Debian/Ubuntu
sudo apt install gh

# Or via conda, brew, etc.
gh auth login
```

Without `gh`, the extension falls back to `git clone` (works for public repos).

## Configuration

Config file: `~/.pi/web-tools.json` (auto-reloaded every 30 seconds)

```json
{
  "exaApiKey": "your-exa-key",
  "github": {
    "maxRepoSizeMB": 350,
    "cloneTimeoutSeconds": 30,
    "clonePath": "/tmp/pi-github-repos"
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `exaApiKey` | `null` | Exa API key (env `EXA_API_KEY` overrides) |
| `github.maxRepoSizeMB` | `350` | Skip cloning repos larger than this |
| `github.cloneTimeoutSeconds` | `30` | Abort clone after this many seconds |
| `github.clonePath` | `/tmp/pi-github-repos` | Where to store cloned repos |

## Tools

### `web_search`

Search the web using Exa. Returns results with snippets and source URLs.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Single search query |
| `queries` | `string[]` | Multiple queries (batch) |
| `numResults` | `number` | Results per query (default: 5, max: 20) |

**Example:**
```
Search for "TypeScript 5.8 new features"
```

### `fetch_content`

Fetch URL(s) and extract readable content as markdown.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Single URL to fetch |
| `urls` | `string[]` | Multiple URLs (parallel, max 3 concurrent) |
| `forceClone` | `boolean` | Force cloning large GitHub repos |

**Content extraction pipeline:**

1. **GitHub URLs** → Clone repo (shallow, depth 1), generate tree + README
2. **HTML pages** → Readability extraction → Markdown conversion
3. **Readability fails** → Jina Reader fallback (`r.jina.ai`)
4. **Non-HTML** → Return raw text

Content over 30,000 characters is truncated with a pointer to `get_search_content`.

### `get_search_content`

Retrieve full content from a previous `web_search` or `fetch_content` result.

| Parameter | Type | Description |
|-----------|------|-------------|
| `responseId` | `string` | ID from a previous tool result |
| `query` | `string` | Filter by query text |
| `queryIndex` | `number` | Filter by query index |
| `url` | `string` | Filter by URL |
| `urlIndex` | `number` | Filter by URL index |

## How GitHub Cloning Works

When `fetch_content` receives a GitHub URL:

1. **Parse** — Extracts owner, repo, ref, path, type (root/blob/tree)
2. **Size check** — Queries repo size via `gh api`. Skips if over threshold (default 350MB)
3. **Clone** — Shallow clone (`--depth 1`) to temp directory, cached for the session
4. **Generate** — Based on URL type:
   - **Root**: Full directory tree + README content
   - **Tree**: Directory listing for the specified path
   - **Blob**: File content (with binary detection and 100K truncation)

Non-code GitHub URLs (issues, PRs, discussions, etc.) are fetched as normal web pages.

## Architecture

```
index.ts          — Extension entry point, 3 tools, session management
├── config.ts     — Config with 30s TTL cache, env var overrides
├── storage.ts    — LRU storage (max 50 entries, session restore)
├── exa-search.ts — Exa API client
├── extract.ts    — Readability + Jina Reader content extraction
└── github-extract.ts — GitHub URL parsing, clone, tree/content generation
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npx vitest run

# Run tests in watch mode
npx vitest

# Load in pi for testing
pi -e ./index.ts
```

## License

MIT
