---
id: 11
title: fetch_content single URL without prompt writes to temp file and returns
  preview + path
status: approved
depends_on:
  - 10
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

### Task 11: fetch_content single URL without prompt writes to temp file and returns preview + path [depends: 10]

**AC covered:** AC 11, AC 17 (raw path no longer uses MAX_INLINE_CONTENT)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Add a new `describe` block in `index.test.ts`. First update the mocks at the top — add `offloadToFile` mock in the hoisted state and mock offload module:

```typescript
const offloadState = vi.hoisted(() => ({
  offloadToFile: vi.fn(),
}));

vi.mock("./offload.js", () => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: offloadState.offloadToFile,
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
  FILE_FIRST_PREVIEW_SIZE: 500,
}));
```

Then add the test:

```typescript
describe("fetch_content file-first storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.extractContent.mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "A".repeat(2000),
      error: null,
    });
    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-abc123.txt");
  });

  it("writes raw single-URL fetch to temp file and returns 500-char preview + path", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-file-first",
      { url: "https://example.com/page" },
      undefined,
      undefined,
      ctx
    );

    // offloadToFile should have been called with the full text
    expect(offloadState.offloadToFile).toHaveBeenCalledOnce();
    const writtenContent = offloadState.offloadToFile.mock.calls[0][0];
    expect(writtenContent).toContain("Example Page");
    expect(writtenContent).toContain("A".repeat(2000));

    const text = getText(result);
    // Should contain a 500-char preview
    expect(text.length).toBeLessThan(2000);
    expect(text).toContain("/tmp/pi-web-abc123.txt");
    expect(text).toContain("Example Page");
    expect(text).toContain("https://example.com/page");
    // Should NOT contain the full 2000-char content inline
    expect(text).not.toContain("A".repeat(2000));
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "writes raw single-URL fetch to temp file"`

Expected: FAIL — `expected offloadToFile to have been called once` — because the current code inlines content up to `MAX_INLINE_CONTENT` (30K) and never calls `offloadToFile` for content under that threshold.

**Step 3 — Write minimal implementation**

In `index.ts`, import `FILE_FIRST_PREVIEW_SIZE` from offload:

Change the import line (line 19):
```typescript
import { shouldOffload, offloadToFile, buildOffloadResult, cleanupTempFiles, FILE_FIRST_PREVIEW_SIZE } from "./offload.js";
```

Replace the single-URL no-prompt path (the block starting at line 426 `let text = \`# ${r.title}\n\n${r.content}\`;` through line 444) with:

```typescript
          // File-first: write raw content to temp file, return preview + path
          const fullText = `# ${r.title}\n\n${r.content}`;
          let filePath: string;
          try {
            filePath = offloadToFile(fullText);
          } catch {
            // Disk error fallback: return inline with warning
            return {
              content: [{ type: "text", text: `⚠ Could not write temp file. Returning inline.\n\n${fullText}` }],
              details: {
                responseId,
                url: r.url,
                title: r.title,
                charCount: r.content.length,
                fileFirstFailed: true,
              },
            };
          }

          const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
          const previewText = [
            `# ${r.title}`,
            `Source: ${r.url}`,
            ``,
            `${preview}`,
            fullText.length > FILE_FIRST_PREVIEW_SIZE ? "\n..." : "",
            ``,
            `Full content saved to ${filePath} (${fullText.length} chars). Use \`read\` to explore further.`,
          ].join("\n");

          return {
            content: [{ type: "text", text: previewText }],
            details: {
              responseId,
              url: r.url,
              title: r.title,
              charCount: r.content.length,
              filePath,
            },
          };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "writes raw single-URL fetch to temp file"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: The existing test `"keeps no-prompt raw behavior"` (in the prompt wiring test) will need updating since it now expects file-first output instead of inline `"# Docs\n\nRAW PAGE"`. Update that assertion in the same task:

In the existing test `"uses filterContent in prompt mode..."`, change the final assertion from:
```typescript
expect(getText(rawResult)).toBe("# Docs\n\nRAW PAGE");
```
to:
```typescript
expect(getText(rawResult)).toContain("Docs");
expect(getText(rawResult)).toContain("Full content saved to");
expect(offloadState.offloadToFile).toHaveBeenCalled();
```
