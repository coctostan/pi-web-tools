# Bug: `web_search` does not surface `searchId` in text output

## Summary

The `web_search` tool returns a `searchId` only in the `details` object, which is not visible to the model. This makes it impossible for the model to use `get_search_content` to retrieve full content from search results, since it never learns the `responseId` it needs to pass.

## How it works today

### `web_search` (broken)

In `index.ts` around line 194, the search ID is generated and stored:

```ts
const searchId = generateId();
// ...
storeResult(searchId, storedData);
```

But the text output only contains formatted query results — the `searchId` is only placed in the `details` object:

```ts
return {
  content: [{ type: "text", text: textParts.join("\n") }],
  details: {
    queryCount: queryList.length,
    successfulQueries,
    totalResults,
    searchId,  // <-- only here, invisible to model
  },
};
```

The model sees the `content[].text` but **not** the `details` object, so it never learns the `searchId`.

### `fetch_content` (correct)

By contrast, `fetch_content` properly includes the `responseId` in the text output for both multi-URL and truncated single-URL cases:

```ts
// Truncated single URL:
text += `\n\n[Content truncated at ${MAX_INLINE_CONTENT} chars. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;

// Multiple URLs:
lines.push(`Use get_search_content with responseId "${responseId}" and url/urlIndex to retrieve content.`);
```

## Impact

- The model cannot call `get_search_content` after `web_search` because it doesn't know the `responseId`.
- The entire `get_search_content` retrieval flow is broken for search results.
- Search results with truncated snippets cannot be expanded to full content.

## Suggested fix

Add the `searchId` to the text output of `web_search`, similar to how `fetch_content` does it. For example, append a line at the end:

```ts
textParts.push(`Use get_search_content with responseId "${searchId}" and query/queryIndex + url/urlIndex to retrieve full content.`);
```

Also: the `details` field uses `searchId` while `get_search_content` expects `responseId`. The field name should be consistent — either rename the details field to `responseId` for consistency, or accept both.

## Reproduction

1. Call `web_search` with any query.
2. Observe the output — no response ID is visible.
3. Attempt to call `get_search_content` — impossible without knowing the ID.

## Files involved

- `index.ts` — `web_search` tool handler (~line 194–224)
- `index.ts` — `get_search_content` tool handler
- `storage.ts` — `storeResult` / `getResult`

## Resolution

Fixed in branch `fix/web-search-missing-response-id`:
- Added `responseId` to `web_search` text output with retrieval hint
- Renamed `searchId` → `responseId` in details object for consistency
