# @coctostan/pi-exa-gh-web-tools

![Pi Web Tools Banner](https://raw.githubusercontent.com/coctostan/pi-exa-gh-web-tools/main/assets/banner-v3.jpg)

Web search via Exa, content extraction (Readability + Jina fallback), and GitHub repo cloning for the Pi coding agent.

## Install

```bash
pi install npm:@coctostan/pi-exa-gh-web-tools
```

Or from GitHub:

```bash
pi install github:coctostan/pi-exa-gh-web-tools
```

## Configuration

### Exa API Key (required for `web_search`)

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

### Optional config file

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

Override config path with:

```bash
export PI_WEB_TOOLS_CONFIG="$HOME/.pi/web-tools.json"
```

## Tools

### `web_search`

Search the web using Exa.

Parameters:

| name | type | description |
| --- | --- | --- |
| `query` | string (optional) | Single search query |
| `queries` | string[] (optional) | Batch search queries |
| `numResults` | number (optional) | Results per query (default 5, max 20) |

Example:

```ts
web_search({ query: "best practices for react server components" })
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

### `get_search_content`

Retrieve full content from a previous `web_search` or `fetch_content` result.

Parameters:

| name | type | description |
| --- | --- | --- |
| `responseId` | string | Response ID from `web_search` or `fetch_content` |
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
