Expand a previous search or fetch result into fuller content.

**Use when:**
- `web_search`, `code_search`, or `fetch_content` already returned a `responseId`
- you want more content from a specific query result or URL without re-running the search

**Prefer over:**
- `fetch_content` when you are expanding an existing cached result
- broad retrieval when `queryIndex` or `urlIndex` can target one specific result

**Tips:**
- pass `query` or `queryIndex` for batched search results
- pass `url` or `urlIndex` to drill into one fetched page
- use `maxChars` to cap large responses