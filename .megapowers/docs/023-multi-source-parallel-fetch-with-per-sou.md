# Feature: Clean up multi-URL+prompt ptcValue shape

## What
Cleaned up the `ptcValue` output shape for the multi-URL + prompt path in `fetch_content`. Renamed fields for clarity, added prompt echo, and made per-source entries minimal by omitting irrelevant null fields.

## Why
The previous `ptcValue` shape for multi-URL+prompt included 7 fields per source entry, most of which were null when content was successfully filtered. PTC consumers (Python code in `code_execution`) had to navigate `result.urls[0].filtered` with noise fields like `content: null`, `filePath: null`, `title: null`. The new shape lets consumers write `result.sources[0].answer` with only the fields that matter for each case.

## Changes

### ptcValue shape (multi-URL + prompt only)

**Before:**
```ts
{
  responseId: string,
  urls: [{ url, title, content, filtered, filePath, charCount, error }],
  successCount: number,
  totalCount: number
}
```

**After:**
```ts
{
  responseId: string,
  prompt: string,          // NEW: echoes the user's prompt
  sources: [               // RENAMED from urls
    // Success: { url, answer, contentLength }
    // Error:   { url, error }
    // Fallback: { url, title, content, filePath, contentLength }
  ],
  successCount: number,
  totalCount: number
}
```

### Files changed
- `index.ts` — Updated ptcValue construction in multi-URL+prompt path (lines 635-690)
- `ptc-value.test.ts` — Replaced 1 test with 3 new tests covering success, error, and fallback shapes

### What was NOT changed
- Human-readable text output (`content[0].text`)
- `details` shape outside `ptcValue`
- Single-URL paths (with or without prompt)
- Multi-URL without prompt path
- Concurrency (`p-limit(3)`)

## Test coverage
222/222 tests pass. Three new tests verify exact field sets for each source entry type using `Object.keys().sort()` assertions.
