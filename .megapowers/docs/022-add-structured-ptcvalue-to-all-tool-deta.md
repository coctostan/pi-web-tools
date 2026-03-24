# Feature: Structured ptcValue for PTC Interop

**Issue:** #022  
**Status:** Complete  

## Summary

Added `details.ptcValue` to all 4 web-tools executors (`web_search`, `fetch_content`, `code_search`, `get_search_content`) so PTC's `code_execution` tool can consume results as structured Python objects instead of parsing human-readable markdown text.

## Motivation

PTC's `tool-adapters.ts` checks `details.ptcValue` on every tool result. When present, it passes the structured data through unchanged to Python code inside `code_execution`. Without it, web-tools results fell into the `default` case — arriving as raw text strings that agents had to parse to extract URLs, titles, or content programmatically.

## What Changed

### `index.ts` — 45 lines added

`details.ptcValue` added to every return path across all 4 tools:

| Tool | Return Paths | ptcValue Shape |
|------|-------------|----------------|
| `web_search` | 1 | `{ responseId, queries: [{query, results: [{title, url, snippet}], error}], queryCount, successfulQueries, totalResults }` |
| `fetch_content` | 9 | `{ responseId, urls: [{url, title, content, filtered, filePath, charCount, error}], successCount, totalCount }` |
| `code_search` | 2 | `{ responseId, query, content, charCount, truncated }` / `{ query, error }` |
| `get_search_content` | 7 | Type-specific shapes for search/fetch/context results |

### `ptc-value.test.ts` — New (14 tests)

Covers all tools' ptcValue shapes including error paths and JSON serializability.

## What's NOT Changed

- Human-readable text output is identical
- Existing `details` fields (`responseId`, `queryCount`, etc.) are untouched
- `ptcValue` is purely additive — no breaking changes

## Note on `ptc` Tool Metadata

The `ptc` metadata field (`{ callable: true, policy: "read-only" }`) on tool registrations was planned but not included — pi's `ToolDefinition` type doesn't currently support it. The `ptcValue` payloads work independently of tool-level metadata. This can be added when pi's extension API exposes the field.

## Test Results

220 tests pass (206 original + 14 new), 16 test files, 0 failures.
