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

### 6. Dynamic Filtering via `tool_result` Interception

Inspired by [Anthropic's programmatic tool calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling) and their [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) guidance. The core insight: large content should never enter the LLM context directly. Instead, it goes to disk and the model uses `bash` to filter/extract only what it needs.

**Mechanism**: Add a `tool_result` event handler in pi-web-tools for `fetch_content` and `get_search_content`. When the result content exceeds a threshold:

1. Write full content to a temp file (e.g. `/tmp/pi-web-<id>.txt`)
2. Replace the tool result with:
   - First ~2KB as a **preview** (so the model has context about what it fetched)
   - File path + total size
   - Hint: `"Full content saved to {path} ({size}). Use bash to search/filter."`
3. Under threshold: pass through unchanged — no overhead for small results

**Why this works**: Pi's model already has `bash`. When it sees "600KB saved to /tmp/pi-web-abc123.txt", it naturally does:
```bash
grep -i 'quarterly revenue' /tmp/pi-web-abc123.txt
```
Only the grep output enters context — same utility as Anthropic's sandbox approach.

**New constants**:
```typescript
const FILE_OFFLOAD_THRESHOLD = 30_000  // chars — content above this goes to file
const PREVIEW_SIZE = 2_000             // chars — preview included in tool result
```

**Temp file cleanup**: Files cleaned up on `session_shutdown`.

**Testing** (`index.test.ts`):
- Content over threshold → verify file written, result replaced with preview + path
- Content under threshold → verify pass-through unchanged
- Session shutdown → verify temp files cleaned up
- Model can bash over the saved file and get expected output

**Files changed** (in addition to section 4):

| File | Change |
|------|--------|
| `index.ts` | `tool_result` event handler for offloading, temp file management, cleanup on shutdown |
| `index.test.ts` | File offload tests |

### 7. What This Doesn't Cover (and Why)

**Multi-tool-loop-without-sampling**: Anthropic's programmatic tool calling also lets the model call multiple tools in a for-loop without re-sampling between each call. This would require pi core changes (a `executeTool()` API in the extension system + IPC with a subprocess). This is an **efficiency optimization** (fewer round trips), not a **context protection** problem. YAGNI for now — would be a separate pi core feature request if needed.

**Also out of scope**:
- Layout-aware PDF parsing
- OCR for scanned PDFs
- Changes to `fetch_content` inline truncation (already works at 30KB)
