---
id: 13
title: fetch_content multi-URL without prompt writes each to its own temp file
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

### Task 13: fetch_content multi-URL without prompt writes each to its own temp file [depends: 10, 11]

**AC covered:** AC 12

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Add to the `"fetch_content file-first storage"` describe block in `index.test.ts`:

```typescript
it("writes each multi-URL raw fetch to its own temp file", async () => {
  state.extractContent.mockImplementation(async (url: string) => {
    if (url === "https://a.example/page") {
      return { url, title: "Page A", content: "Content A " + "x".repeat(1000), error: null };
    }
    return { url, title: "Page B", content: "Content B " + "y".repeat(1000), error: null };
  });

  let callCount = 0;
  offloadState.offloadToFile.mockImplementation(() => {
    callCount++;
    return `/tmp/pi-web-file${callCount}.txt`;
  });

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = {
    modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
  } as any;

  const result = await fetchContentTool.execute(
    "call-multi-file",
    { urls: ["https://a.example/page", "https://b.example/page"] },
    undefined,
    undefined,
    ctx
  );

  expect(offloadState.offloadToFile).toHaveBeenCalledTimes(2);

  const text = getText(result);
  expect(text).toContain("Page A");
  expect(text).toContain("Page B");
  expect(text).toContain("/tmp/pi-web-file1.txt");
  expect(text).toContain("/tmp/pi-web-file2.txt");
  expect(text).toContain("https://a.example/page");
  expect(text).toContain("https://b.example/page");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "writes each multi-URL raw fetch to its own temp file"`

Expected: FAIL — `expected offloadToFile to have been called 2 times` — because the current multi-URL no-prompt path returns a summary listing without writing files.

**Step 3 — Write minimal implementation**

In `index.ts`, replace the multi-URL no-prompt block (starting at line ~496 `// No prompt: existing summary behavior`) with:

```typescript
        // No prompt: file-first for each URL
        const successCount = results.filter((r) => !r.error).length;
        const lines: string[] = [];
        lines.push(`Fetched ${successCount}/${results.length} URLs.`);
        lines.push("");
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.error) {
            lines.push(`${i + 1}. ❌ ${r.url}: ${r.error}`);
          } else {
            const fullText = `# ${r.title}\n\n${r.content}`;
            let filePath: string;
            try {
              filePath = offloadToFile(fullText);
            } catch {
              lines.push(`${i + 1}. ⚠ ${r.title} — could not write temp file`);
              lines.push(`   ${r.url}`);
              continue;
            }
            const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
            lines.push(`${i + 1}. ✅ ${r.title}`);
            lines.push(`   ${r.url}`);
            lines.push(`   File: ${filePath} (${fullText.length} chars)`);
            lines.push(`   Preview: ${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
          }
          lines.push("");
        }
        lines.push(`Use \`read\` on the file paths above to explore content. Use get_search_content with responseId "${responseId}" to retrieve from memory.`);
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            responseId,
            successCount,
            totalCount: results.length,
          },
        };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "writes each multi-URL raw fetch to its own temp file"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: The existing test `"keeps existing multi-url summary behavior when prompt is omitted"` needs updating since the output format changed. Update its assertions from:
```typescript
expect(text).toContain("Fetched 2/3 URLs. Response ID:");
expect(text).toContain("1. ✅ A Docs (5 chars)");
expect(text).toContain("2. ✅ B Docs (5 chars)");
expect(text).toContain("3. ❌ https://c.example/docs: timeout");
expect(text).toContain("Use get_search_content with responseId");
```
to:
```typescript
expect(text).toContain("Fetched 2/3 URLs.");
expect(text).toContain("A Docs");
expect(text).toContain("B Docs");
expect(text).toContain("❌ https://c.example/docs: timeout");
expect(offloadState.offloadToFile).toHaveBeenCalledTimes(2);
```

All tests passing.
