# Spec: Add structured ptcValue to all tool details for PTC interop

## Overview

Add `details.ptcValue` to all 4 web-tools executors and `ptc` metadata to their tool registrations. PTC's `tool-adapters.ts` already checks for `details.ptcValue` and passes it through as-is — this issue provides the structured payloads from our side.

## Changes

### 1. Tool registration metadata

Each of the 4 `pi.registerTool()` calls gets a `ptc` field:

```ts
ptc: { callable: true, policy: "read-only" }
```

This tells PTC these tools are available for programmatic use inside `code_execution` and are read-only.

### 2. ptcValue shapes per tool

#### 2a. `web_search`

Single return path (line ~353). Add `ptcValue` to the existing `details`:

```ts
ptcValue: {
  responseId: string,
  queries: Array<{
    query: string,
    results: Array<{ title: string, url: string, snippet: string }>,
    error: string | null,
  }>,
  queryCount: number,
  successfulQueries: number,
  totalResults: number,
}
```

This mirrors the existing `StoredResultData` / `results` array that's already constructed.

#### 2b. `fetch_content`

Multiple return paths. The ptcValue shape is consistent across all paths:

```ts
ptcValue: {
  responseId: string,
  urls: Array<{
    url: string,
    title: string | null,
    content: string | null,    // full content when available inline
    filtered: string | null,   // Haiku-filtered answer when prompt was used
    filePath: string | null,   // temp file path when offloaded
    charCount: number | null,
    error: string | null,
  }>,
  successCount: number,
  totalCount: number,
}
```

Return paths to instrument (single-URL):
1. **Error** (line 486) — `error` set, everything else null
2. **Filtered success** (line 503) — `filtered` set, `content` null
3. **Filter failed, offloaded** (line 524) — `content` set, `filePath` set
4. **Filter failed, inline fallback** (line 547) — `content` set, no `filePath`
5. **GitHub clone result** (line 563) — `content` set
6. **Raw offloaded** (line 602) — `filePath` set, `content` null (too large)
7. **Raw inline fallback** (line 580) — `content` set, no `filePath`

Return paths to instrument (multi-URL):
8. **Multi-URL with prompt** (line 662) — per-URL filtered/error
9. **Multi-URL without prompt** (line 712) — per-URL offloaded/error

For multi-URL paths, the per-URL results array is built during iteration.

#### 2c. `code_search`

Two return paths:

**Success** (line 835):
```ts
ptcValue: {
  responseId: string,
  query: string,
  content: string,
  charCount: number,
  truncated: boolean,
}
```

**Error** (line 846):
```ts
ptcValue: {
  query: string,
  error: string,
}
```

#### 2d. `get_search_content`

Multiple return paths based on stored type. The ptcValue shape varies by type:

**Search — all queries** (line 957):
```ts
ptcValue: {
  type: "search",
  queries: Array<{ query: string, results: Array<{title, url, snippet}>, error: string | null }>,
}
```

**Search — single query** (line 971):
```ts
ptcValue: {
  type: "search",
  query: string,
  results: Array<{ title: string, url: string, snippet: string }>,
  error: string | null,
}
```

**Fetch — all URLs summary** (line 1016):
```ts
ptcValue: {
  type: "fetch",
  urls: Array<{ url: string, title: string | null, charCount: number | null, error: string | null }>,
}
```

**Fetch — single URL** (line 1032):
```ts
ptcValue: {
  type: "fetch",
  url: string,
  title: string,
  content: string,
  charCount: number,
}
```

**Fetch — single URL error** (line 1023):
```ts
ptcValue: {
  type: "fetch",
  url: string,
  error: string,
}
```

**Context — success** (line 1053):
```ts
ptcValue: {
  type: "context",
  query: string,
  content: string,
  charCount: number,
}
```

**Context — error** (line 1047):
```ts
ptcValue: {
  type: "context",
  query: string,
  error: string,
}
```

### 3. Implementation approach

- Build a `ptcValue` object alongside the existing `details` construction, then spread it into details: `details: { ...existingFields, ptcValue }`
- For `fetch_content` multi-URL paths, accumulate per-URL structured results in an array during iteration, then attach to details at return time
- For `fetch_content` single-URL, build the ptcValue inline at each return point
- Helper function `buildFetchPtcUrl()` to reduce duplication across the many single-URL return paths

### 4. Files modified

- `index.ts` — all changes are here (tool registrations + executor return values)

### 5. No new files

All changes are in `index.ts`. No new modules needed.

## Testing

- New test file `ptc-value.test.ts` with tests for each tool:
  - `web_search` ptcValue shape on success and partial failure
  - `fetch_content` ptcValue shape for: error, filtered, raw offloaded, GitHub clone, multi-URL
  - `code_search` ptcValue shape on success and error
  - `get_search_content` ptcValue shape for all stored types
- Verify JSON-serializability of all ptcValue objects
- Verify existing details fields are unchanged
- All 198 existing tests must pass

## Out of scope

- Changing text output format
- PTC-side helpers or documentation
- `pythonName` or other optional PtcToolOptions fields
