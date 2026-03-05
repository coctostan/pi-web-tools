---
id: 12
title: fetch_content prompt fallback writes to temp file instead of inlining
status: approved
depends_on:
  - 10
  - 11
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

### Task 12: fetch_content prompt fallback writes to temp file instead of inlining [depends: 10, 11]

**AC covered:** AC 14, AC 17
**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Add to `describe("fetch_content file-first storage", ...)` in `index.test.ts`:

```typescript
it("writes single-url prompt fallback content to temp file (no MAX_INLINE path)", async () => {
  state.extractContent.mockResolvedValue({
    url: "https://example.com/page",
    title: "Example Page",
    content: "X".repeat(2000),
    error: null,
  });

  state.filterContent.mockReset();
  state.filterContent.mockResolvedValueOnce({
    filtered: null,
    reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)",
  });

  offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-single-fallback.txt");

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

  const result = await fetchContentTool.execute(
    "call-single-fallback",
    { url: "https://example.com/page", prompt: "What matters?" },
    undefined,
    undefined,
    ctx
  );

  expect(offloadState.offloadToFile).toHaveBeenCalledTimes(1);
  const text = getText(result);
  expect(text).toContain("Source: https://example.com/page");
  expect(text).toContain("/tmp/pi-web-single-fallback.txt");
  expect(text).toContain("Full content saved to");
  expect(text).not.toContain("Content truncated");
  expect(text).not.toContain("MAX_INLINE_CONTENT");
});
```

Also update existing prompt-mode expectations to align with file-first fallback:

1) In test `"uses filterContent in prompt mode, remaps no-model warning, preserves model-error warning, and keeps no-prompt raw behavior"`, replace:

```typescript
expect(getText(noModelFallback)).toBe(
  "⚠ No filter model available. Returning raw content.\n\n# Docs\n\nRAW PAGE"
);
```

with:

```typescript
expect(getText(noModelFallback)).toContain("No filter model available");
expect(getText(noModelFallback)).toContain("Full content saved to");
expect(offloadState.offloadToFile).toHaveBeenCalled();
```

2) In test `"uses p-limit(3) and returns filtered + fallback blocks for multi-url prompt mode"`, replace inline fallback expectation:

```typescript
expect(text).toContain(
  "⚠ No filter model available. Returning raw content.\n\n# B Docs\n\nRAW B"
);
```

with file-first expectation:

```typescript
expect(text).toContain("# B Docs");
expect(text).toContain("Full content saved to");
expect(offloadState.offloadToFile).toHaveBeenCalled();
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "writes single-url prompt fallback content to temp file (no MAX_INLINE path)"`

Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times` because single-URL prompt fallback still returns inline truncated content.

**Step 3 — Write minimal implementation**

In `index.ts`, update **both** prompt fallback branches inside `fetch_content`:

1) Replace the single-URL prompt fallback block:

```typescript
let text = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
let truncated = false;

if (text.length > MAX_INLINE_CONTENT) {
  text = text.slice(0, MAX_INLINE_CONTENT);
  text += `\n\n[Content truncated at ${MAX_INLINE_CONTENT} chars. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
  truncated = true;
}

return {
  content: [{ type: "text", text }],
  details: {
    responseId,
    url: r.url,
    title: r.title,
    charCount: r.content.length,
    truncated,
    filtered: false,
  },
};
```

with file-first logic:

```typescript
const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
try {
  const filePath = offloadToFile(fullText);
  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
  return {
    content: [{
      type: "text",
      text: [
        `# ${r.title}`,
        `Source: ${r.url}`,
        `⚠ ${reason}`,
        "",
        `${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`,
        "",
        `Full content saved to ${filePath} (${fullText.length} chars). Use \`read\` to explore further.`,
      ].join("\n"),
    }],
    details: {
      responseId,
      url: r.url,
      title: r.title,
      charCount: r.content.length,
      filtered: false,
      filePath,
    },
  };
} catch {
  return {
    content: [{ type: "text", text: `⚠ Could not write temp file. Returning inline.\n\n${fullText}` }],
    details: {
      responseId,
      url: r.url,
      title: r.title,
      charCount: r.content.length,
      filtered: false,
      fileFirstFailed: true,
    },
  };
}
```

2) Replace the multi-URL prompt fallback block:

```typescript
let fallbackText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
if (fallbackText.length > MAX_INLINE_CONTENT) {
  fallbackText = fallbackText.slice(0, MAX_INLINE_CONTENT);
  fallbackText += `\n\n[Content truncated. Use get_search_content with responseId "${responseId}" and url "${r.url}" for full content.]`;
}
return fallbackText;
```

with:

```typescript
const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
try {
  const filePath = offloadToFile(fullText);
  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
  return [
    `# ${r.title}`,
    `Source: ${r.url}`,
    `⚠ ${reason}`,
    "",
    `${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`,
    "",
    `Full content saved to ${filePath} (${fullText.length} chars). Use \`read\` to explore further.`,
  ].join("\n");
} catch {
  return `⚠ Could not write temp file. Returning inline.\n\n${fullText}`;
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "writes single-url prompt fallback content to temp file (no MAX_INLINE path)"`

Expected: PASS.

**Step 5 — Verify no regressions**

Run:
- `npx vitest run`
- `grep -n "MAX_INLINE_CONTENT" index.ts`

Expected:
- Vitest: all tests passing.
- Grep: no `MAX_INLINE_CONTENT` usage in any `fetch_content` raw/fallback branches (single raw, multi raw, single prompt fallback, multi prompt fallback); remaining usage only in non-fetch paths (e.g., `code_search`).
