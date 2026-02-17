# @coctostan/pi-exa-gh-web-tools

![Pi Web Tools Banner](https://raw.githubusercontent.com/coctostan/pi-exa-gh-web-tools/main/assets/banner-v3.jpg)

Web search, code search, content extraction, and GitHub repo cloning for the Pi coding agent. Powered by Exa.

## Install

```bash
pi install npm:@coctostan/pi-exa-gh-web-tools
```

Or from GitHub:

```bash
pi install github:coctostan/pi-exa-gh-web-tools
```

## Configuration

### Exa API Key (required for `web_search` and `code_search`)

Set an environment variable:

```bash
export EXA_API_KEY="your-key-here"
```

Or create `~/.pi/web-tools.json`:

```json
{
  "exaApiKey": "your-key-here"
}
```

Environment variable takes precedence.

### Tool Toggles

Disable specific tools via config. All tools are enabled by default. Changes require restarting pi.

```json
{
  "tools": {
    "web_search": true,
    "code_search": true,
    "fetch_content": true,
    "get_search_content": true
  }
}
```

`get_search_content` is automatically disabled when all content-producing tools (`web_search`, `code_search`, `fetch_content`) are off.

### Full config file

Config file: `~/.pi/web-tools.json` (auto-reloaded every 30 seconds)

```json
{
  "exaApiKey": "your-exa-key",
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

Override config path with:

```bash
export PI_WEB_TOOLS_CONFIG="$HOME/.pi/web-tools.json"
```

## Tools

### `web_search`

Search the web for pages matching a query. Returns highlights (short relevant excerpts), not full page content. Use `fetch_content` to read a page in full.

Parameters:

| name | type | description |
| --- | --- | --- |
| `query` | string (optional) | Single search query |
| `queries` | string[] (optional) | Batch search queries |
| `numResults` | number (optional) | Results per query (default 5, max 20) |
| `type` | string (optional) | `"auto"` (default, highest quality), `"instant"` (sub-150ms), `"deep"` (comprehensive research) |
| `category` | string (optional) | Filter by content category: `"company"`, `"research paper"`, `"news"`, `"tweet"`, `"people"`, `"personal site"`, `"financial report"`, `"pdf"` |
| `includeDomains` | string[] (optional) | Only include results from these domains |
| `excludeDomains` | string[] (optional) | Exclude results from these domains |

Examples:

```ts
web_search({ query: "best practices for react server components" })
web_search({ query: "AI news", category: "news", type: "instant" })
web_search({ query: "rust async", includeDomains: ["github.com", "docs.rs"] })
```

### `fetch_content`

Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree/file views).

Parameters:

| name | type | description |
| --- | --- | --- |
| `url` | string (optional) | Single URL to fetch |
| `urls` | string[] (optional) | Multiple URLs (parallel) |
| `forceClone` | boolean (optional) | Force cloning large GitHub repos |

Examples:

```ts
fetch_content({ url: "https://react.dev/reference/react/use-client" })
fetch_content({ url: "https://github.com/facebook/react" })
fetch_content({ url: "https://github.com/facebook/react/blob/main/packages/react/src/React.js" })
```

#### GitHub cloning behavior

- Uses `gh repo clone` when available; falls back to `git clone` for public repos.
- Skips cloning very large repos unless `forceClone: true` is provided.
- Clones into `github.clonePath` (default `/tmp/pi-github-repos`).

### `code_search`

Search GitHub repos, documentation, and Stack Overflow for working code examples. Powered by Exa's Context API. Returns formatted code snippets, not web pages.

Parameters:

| name | type | description |
| --- | --- | --- |
| `query` | string | Describe what code you need |
| `tokensNum` | number (optional) | Response size in tokens (default: auto, range: 50–100000) |

Examples:

```ts
code_search({ query: "how to use vercel ai sdk streaming with gpt-4" })
code_search({ query: "React hooks for state management", tokensNum: 5000 })
```

### `get_search_content`

Retrieve full content from a previous `web_search`, `code_search`, or `fetch_content` result.

Parameters:

| name | type | description |
| --- | --- | --- |
| `responseId` | string | Response ID from `web_search`, `code_search`, or `fetch_content` |
| `query` | string (optional) | Get content for this query |
| `queryIndex` | number (optional) | Get content for query at index |
| `url` | string (optional) | Get content for this URL |
| `urlIndex` | number (optional) | Get content for URL at index |

## Development

```bash
npm install
npm test
npm run test:watch

# Load in pi for manual testing
pi -e ./index.ts
```

## License

MIT
