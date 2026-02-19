# PDF Support & Content Size Guardrails

**Date**: 2026-02-19
**Status**: Design complete

## Problem

1. **PDFs blow up context**: `application/pdf` isn't in `isBinaryType()`, so PDFs bypass the binary guard, fail HTML parsing, and dump raw binary garbage into context. A 600KB PDF can destroy an entire session.
2. **`get_search_content` has no size limit**: It returns the full stored content with zero truncation, so even properly extracted content can flood context.

## Design

### 1. PDF Text Extraction

When `fetch_content` encounters a `content-type: application/pdf` response:

- Add PDF detection **before** the `isBinaryType` guard in `extract.ts`
- Download the response as a `Buffer` instead of text
- Run `pdf-parse` on the buffer to extract text
- Return extracted text as the content string, same as HTML extraction
- On failure (corrupt, encrypted, etc.), return error message: `"Failed to extract text from PDF: <reason>"` — no binary garbage

Extracted text flows through the existing pipeline: stored via `storage.ts`, truncated to `MAX_INLINE_CONTENT` (30KB) for inline response, full text available via `get_search_content`.

No changes to `storage.ts` or storage format — it's all plain text strings by the time it's stored.

**Dependency**: `pdf-parse` — lightweight, text-only extraction, ~200KB. Most popular PDF text extraction on npm.

### 2. Size Guardrails on `get_search_content`

- Add optional `maxChars` parameter to `get_search_content` tool definition (in `tool-params.ts`)
- **Default**: 30,000 chars — matches `MAX_INLINE_CONTENT`
- **Hard ceiling**: 100,000 chars — even if model requests more, cap here
- When content exceeds limit, truncate and append: `"\n\n[Content truncated at {limit} chars. Total: {total} chars. Use a higher maxChars to retrieve more.]"`
- Existing calls without `maxChars` get 30KB default — backward compatible

Worst case for a single `get_search_content` call: ~100KB entering context.

Inspired by Claude's `max_content_tokens` parameter on their web fetch tool.

### 3. Testing Strategy

**PDF extraction tests** (`extract.test.ts`):
- Fetch a real small PDF URL — verify text extraction returns readable content
- Fetch a URL returning `application/pdf` with corrupt data — verify graceful error, no binary garbage
- Verify extracted PDF text is stored and retrievable via `get_search_content`

**`get_search_content` guardrail tests** (`index.test.ts`):
- No `maxChars` — verify truncation at 30KB default for large content
- Explicit `maxChars` (e.g. 50,000) — verify truncation at that limit
- `maxChars` above 100KB ceiling — verify hard cap at 100KB
- Small content under limit — verify no truncation, no truncation message
- Truncation message includes total size

### 4. Files Changed

| File | Change |
|------|--------|
| `extract.ts` | PDF detection and `pdf-parse` extraction |
| `tool-params.ts` | `maxChars` parameter on `get_search_content` |
| `index.ts` | Apply `maxChars` with default/ceiling |
| `extract.test.ts` | PDF extraction tests |
| `index.test.ts` | Truncation tests |
| `package.json` | Add `pdf-parse` dependency |

**Unchanged**: `storage.ts`, `exa-search.ts`, `github-extract.ts`, `config.ts`

### 5. New Constants

```typescript
const DEFAULT_GET_CONTENT_MAX_CHARS = 30_000
const MAX_GET_CONTENT_CHARS = 100_000
```

### 6. Out of Scope

- Dynamic filtering (requires code execution — separate design)
- Layout-aware PDF parsing
- OCR for scanned PDFs
- Changes to `fetch_content` inline truncation (already works at 30KB)
