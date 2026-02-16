# AGENTS.md

## Project Overview

Pi extension providing three tools: `web_search` (Exa API), `fetch_content` (URL extraction + GitHub cloning), and `get_search_content` (retrieve stored results). Published as `@coctostan/pi-exa-gh-web-tools`.

## Architecture

Flat TypeScript modules, no build step (pi loads `.ts` directly):

- **`index.ts`** — Extension entry point. Registers tools and session event handlers via `ExtensionAPI`.
- **`exa-search.ts`** — Exa API client (`searchExa`, `formatSearchResults`).
- **`extract.ts`** — HTML fetching + Readability + Turndown for markdown extraction.
- **`github-extract.ts`** — GitHub URL detection, shallow clone, tree/file content extraction.
- **`storage.ts`** — In-memory result store with session persistence via `appendEntry`/`restoreFromSession`.
- **`config.ts`** — Config from `~/.pi/web-tools.json` and `EXA_API_KEY` env var, cached with 30s TTL.
- **`tool-params.ts`** — Input normalization/validation for tool parameters.

## Key Conventions

- **Pi extension API**: Uses `pi.registerTool()` with Typebox schemas, `renderCall`/`renderResult` for TUI.
- **Session lifecycle**: Handles `session_start`, `session_switch`, `session_fork`, `session_tree`, `session_shutdown` to manage state.
- **Peer dependencies**: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox` — never bundle these.
- **Package spec**: `"pi": { "extensions": ["./index.ts"] }` in package.json. Uses `pi-package` keyword.

## Development

```bash
npm test          # vitest run
npm run test:watch
```

Tests use Vitest. Integration tests for GitHub cloning are in `github-extract.clone.test.ts`. Config, storage, and extraction each have dedicated test files.

## Configuration

Exa API key: `EXA_API_KEY` env var (priority) or `exaApiKey` in `~/.pi/web-tools.json`.
GitHub settings (`maxRepoSizeMB`, `cloneTimeoutSeconds`, `clonePath`) in `github.` namespace of same config file.

## Exa API — Current Usage vs Available Features

### What we use today

`exa-search.ts` makes raw `fetch` calls to `POST https://api.exa.ai/search` with minimal parameters:

```json
{ "query": "...", "numResults": 5, "contents": { "text": { "maxCharacters": 1000 } } }
```

Only `query` and `numResults` are exposed to the tool user. Search type defaults to `auto`.

### Available Exa features not yet used

#### Search parameters (same `/search` endpoint)

| Parameter | Description |
|---|---|
| `type` | `"auto"` (default, highest quality), `"instant"` (sub-200ms), `"deep"` (comprehensive with query expansion) |
| `includeDomains` / `excludeDomains` | Restrict or exclude specific domains |
| `includeText` / `excludeText` | Require or ban text strings in results (max 1 string, up to 5 words) |
| `category` | Target content types: `company`, `people`, `research paper`, `news`, `tweet`, `personal site`, `financial report`, `pdf` |
| `startPublishedDate` / `endPublishedDate` | Filter by publication date (ISO format) |
| `startCrawlDate` / `endCrawlDate` | Filter by crawl date (ISO format) |
| `additionalQueries` | Alt query formulations for `type: "deep"` only (max 5) |
| `useAutoprompt` | Let Exa enhance the query automatically |
| `userLocation` | Two-letter ISO country code for localized results |

#### Content retrieval modes (via `contents` in search request)

| Mode | Use case |
|---|---|
| `text` | Full page text. Supports `maxCharacters`, `verbosity` (`compact`→`full`), `includeHtmlTags` |
| `highlights` | Token-efficient excerpts relevant to query. Supports `query`, `maxCharacters`, `numSentences`, `highlightsPerUrl`. **Best for agentic workflows** — 10x fewer tokens than full text |
| `summary` | LLM-generated summary. Supports custom `query` and `schema` (JSON/Zod) for structured extraction |
| `subpages` | Return N related subpages per result, with optional `subpageTarget` for ranking |
| `maxAgeHours` | Content freshness: `0` = always livecrawl, `-1` = cache only, N = livecrawl if older than N hours |

#### Context API — `/context` endpoint (Exa Code)

Purpose-built for coding agents. Searches billions of GitHub repos, docs, and Stack Overflow for token-efficient code examples. Separate from the `/search` endpoint.

```
POST https://api.exa.ai/context
{ "query": "how to use vercel ai sdk streaming", "tokensNum": 5000 }
```

| Parameter | Description |
|---|---|
| `query` | Code/framework question (max 2000 chars) |
| `tokensNum` | `"dynamic"` (auto) or `50`–`100000`. Default `"dynamic"`, `5000` is a good explicit default |

Returns a single `response` string with formatted code snippets and source URLs — not a list of results. Good for framework syntax, API usage, library patterns, and setup recipes.

#### Research API — `/research` endpoint (async)

An asynchronous multi-step pipeline for deep, open-ended research. You submit instructions and optionally a JSON Schema for structured output; Exa agents plan, search, and synthesize a grounded report with citations.

**Workflow**: `POST /research` → get `researchId` → poll `GET /research/{id}` until `status: "completed"` → read `output`.

```
POST https://api.exa.ai/research
{
  "instructions": "Compare flagship GPUs from NVIDIA, AMD, and Intel — extract pricing, TDP, release date",
  "model": "exa-research",
  "outputSchema": {
    "type": "object",
    "properties": {
      "gpus": { "type": "array", "items": { ... } }
    }
  }
}
```

| Parameter | Description |
|---|---|
| `instructions` | Natural language research task (max 4096 chars). Should describe what info to find, how to search, and desired output format |
| `model` | `exa-research` (default, adaptive compute, p50 ~45s) or `exa-research-pro` (max quality, p50 ~90s) |
| `outputSchema` | Optional JSON Schema — returns validated structured JSON instead of markdown report. Keep to 1–5 root fields, use enums for accuracy |

**Response types**: Without `outputSchema` → detailed markdown report. With `outputSchema` → parsed JSON matching the schema.

**Pricing**: Variable usage-based — ~$5/1k searches, ~$5–10/1k pages read, ~$5/1M reasoning tokens. A typical task costs ~$0.10–0.25.

**SDK methods**: `exa.research.create()`, `exa.research.get()`, `exa.research.pollUntilFinished()`, `exa.research.list()`.

**Best practices**:
- Be explicit: describe what, how to find it, and how to compose the output
- Keep schemas small (1–5 root fields)
- Use enums in schemas to reduce hallucinations

#### Other Exa endpoints

| Endpoint | Description |
|---|---|
| `findSimilar` / `findSimilarAndContents` | Find pages similar to a given URL |
| `answer` / `streamAnswer` | Direct answers with citations, supports `systemPrompt` and `outputSchema` |
| `getContents` | Retrieve contents for known URLs without searching |

#### TypeScript SDK (`exa-js`)

Official SDK: `npm install exa-js`. Wraps all endpoints with typed methods. Reads `EXA_API_KEY` from env automatically. We currently use raw `fetch` instead — migrating to the SDK would reduce boilerplate and get type safety for free.

```ts
import Exa from "exa-js";
const exa = new Exa(); // reads EXA_API_KEY from env
const result = await exa.searchAndContents("query", { text: true, highlights: true });
```

### Highest-value additions

1. **Context API (`/context`)** — A natural new tool (`code_search` or similar) for coding-specific queries. Low effort, high value for pi's use case.
2. **Research API (`/research`)** — Async deep research tool for complex, multi-source questions. Returns structured JSON or markdown reports with citations. Useful for competitive analysis, market research, technical comparisons. Would need a polling/callback pattern since tasks take 45–180s.
3. **`highlights` content mode** — Switch from `text` to `highlights` for the default `web_search` to dramatically reduce token usage while keeping relevance.
4. **Search filters** — Expose `type`, `includeDomains`, `excludeDomains`, `category` as optional tool parameters for targeted searches.
5. **`exa-js` SDK** — Replace raw fetch with the official SDK for cleaner code and full type coverage.
