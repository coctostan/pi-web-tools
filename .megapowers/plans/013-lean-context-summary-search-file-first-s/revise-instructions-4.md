## Task 12: fetch_content prompt fallback writes to temp file instead of inlining

Task 12 now covers **multi-URL** prompt fallback, but AC14/AC17 apply to `fetch_content` prompt fallback generally, and `index.ts` has a separate **single-URL prompt fallback** branch that still uses `MAX_INLINE_CONTENT` truncation.

### What is still wrong
In `index.ts` single-URL prompt mode (`if (results.length === 1) { ... if (prompt) { ... } }`), the fallback block is still:

```ts
let text = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
let truncated = false;

if (text.length > MAX_INLINE_CONTENT) {
  text = text.slice(0, MAX_INLINE_CONTENT);
  text += `\n\n[Content truncated at ${MAX_INLINE_CONTENT} chars. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
  truncated = true;
}

return {
  content: [{ type: "text", text }],
  details: { responseId, url: r.url, title: r.title, charCount: r.content.length, truncated, filtered: false },
};
```

That must be file-first, same as multi-URL fallback.

### Required changes
1. **Step 1**: Add a failing single-URL prompt-fallback test (in addition to your multi-URL fallback test).
   - Use `filtered: null` from `state.filterContent`.
   - Assert `offloadState.offloadToFile` is called.
   - Assert response contains `Full content saved to ...` and a path.
   - Assert response does **not** contain truncation messaging.

   Also update the existing prompt wiring assertion in `index.test.ts` that currently expects inline fallback:

```ts
expect(getText(noModelFallback)).toBe(
  "⚠ No filter model available. Returning raw content.\n\n# Docs\n\nRAW PAGE"
);
```

   Replace with file-first expectations, e.g.:

```ts
expect(getText(noModelFallback)).toContain("No filter model available");
expect(getText(noModelFallback)).toContain("Full content saved to");
expect(offloadState.offloadToFile).toHaveBeenCalled();
```

2. **Step 3**: Replace the single-URL prompt fallback block with file-first logic using the same APIs already used elsewhere:
   - `offloadToFile(fullText)`
   - `FILE_FIRST_PREVIEW_SIZE`
   - warning-inline fallback on write failure (`⚠ Could not write temp file. Returning inline.`)

   Use this shape:

```ts
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

3. **Step 5 verification must explicitly prove AC17**:
   - Run `grep -n "MAX_INLINE_CONTENT" index.ts`
   - Expected: no matches in any `fetch_content` raw/fallback branches (single raw, multi raw, single prompt fallback, multi prompt fallback).
   - Remaining matches are acceptable only in non-fetch paths (e.g., `code_search`).

---

## Task 14: fetch_content with prompt and successful filter returns inline without writing file

Current Task 14 uses an artificial RED by mixing success + fallback calls in one test, then deleting the fallback call in Step 3. That violates granularity (two behaviors in one test) and makes Step 2 failure unrelated to AC13.

### Required changes
1. **Convert Task 14 to `[no-test]` verification task**.
   - Update frontmatter: `no_test: true`.
   - Keep AC13 ownership explicit, but point to the concrete executable assertion that now exists in `index.test.ts`.

2. Replace task body with deterministic verification steps only:
   - Verify assertion text exists:

```bash
grep -n "expect(offloadState.offloadToFile).not.toHaveBeenCalled()" index.test.ts
```

   - Verify inline success response assertion exists:

```bash
grep -n "Source: https://example.com/docs\\n\\n100 requests/minute." index.test.ts
```

   - Run targeted test:

```bash
npx vitest run index.test.ts -t "uses filterContent in prompt mode"
```

   Expected: PASS.

3. Remove the current Step 1/2/3 structure that intentionally introduces and then removes a fallback call inside the same test.