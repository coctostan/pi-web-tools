---
id: 4
title: Add ptcValue to fetch_content executor
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
files_to_create: []
---

Add `details.ptcValue` to all return paths in `fetch_content`. This is the most complex tool with ~9 return paths.

### TDD

**RED:** Write tests covering:
1. Single URL error → ptcValue with error
2. Single URL filtered success → ptcValue with filtered text
3. Single URL raw offloaded → ptcValue with filePath
4. Single URL GitHub clone → ptcValue with content
5. Multi-URL with prompt → ptcValue with per-URL results
6. Multi-URL without prompt → ptcValue with per-URL results

**GREEN:**

Create helper to reduce duplication:
```ts
function buildFetchUrlPtc(r: ExtractedContent, opts?: {
  filtered?: string | null,
  filePath?: string | null,
  content?: string | null,
}): object
```

For **single-URL** paths, build ptcValue at each return point:
```ts
ptcValue: {
  responseId,
  urls: [buildFetchUrlPtc(r, { ... })],
  successCount: ...,
  totalCount: 1,
}
```

For **multi-URL** paths, accumulate per-URL results during iteration:
- Multi-URL with prompt (line ~618): collect structured results alongside text blocks
- Multi-URL without prompt (line ~674): collect structured results alongside lines

Then attach at return:
```ts
ptcValue: {
  responseId,
  urls: ptcUrls,
  successCount,
  totalCount: results.length,
}
```

**REFACTOR:** Extract the helper function if it reduces complexity.

### Return paths to instrument

Single-URL (7 paths):
- Line 486: error
- Line 503: filtered success
- Line 524: filter failed, offloaded
- Line 547: filter failed, inline fallback
- Line 563: GitHub clone
- Line 580: raw inline fallback
- Line 602: raw offloaded

Multi-URL (2 paths):
- Line 662: multi-URL with prompt
- Line 712: multi-URL without prompt
