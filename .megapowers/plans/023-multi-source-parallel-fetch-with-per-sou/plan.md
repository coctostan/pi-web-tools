# Plan

### Task 1: Update multi-URL+prompt ptcValue shape: sources, answer, contentLength, prompt

**Covers:** AC 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

**Files:**
- Modify: `index.ts`
- Test: `ptc-value.test.ts`

**Step 1 — Write the failing test**

In `ptc-value.test.ts`, replace the existing test "includes ptcValue on multi-URL with prompt" (lines 316-342) with three new tests that verify the new shape. Add these tests inside the existing `describe("fetch_content ptcValue", ...)` block, replacing the old test:

```typescript
  it("multi-URL+prompt ptcValue uses sources (not urls), answer, contentLength, and echoes prompt", async () => {
    state.extractContent.mockImplementation(async (url: string) => ({
      url,
      title: `Title ${url}`,
      content: `Content ${url}`,
      error: null,
    }));
    state.filterContent.mockResolvedValue({
      filtered: "filtered answer",
      model: "anthropic/claude-haiku-4-5",
    });

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-multi-prompt",
      { urls: ["https://a.com", "https://b.com"], prompt: "question" },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    // R1: sources replaces urls
    expect(ptc.sources).toHaveLength(2);
    expect(ptc).not.toHaveProperty("urls");
    // R4: prompt echoed
    expect(ptc.prompt).toBe("question");
    // R2: answer replaces filtered
    expect(ptc.sources[0].answer).toBe("filtered answer");
    expect(ptc.sources[0]).not.toHaveProperty("filtered");
    // R3: contentLength replaces charCount
    expect(ptc.sources[0].contentLength).toBe("filtered answer".length);
    expect(ptc.sources[0]).not.toHaveProperty("charCount");
    // R5: minimal — no content, filePath, title, error
    expect(ptc.sources[0]).not.toHaveProperty("content");
    expect(ptc.sources[0]).not.toHaveProperty("filePath");
    expect(ptc.sources[0]).not.toHaveProperty("title");
    expect(ptc.sources[0]).not.toHaveProperty("error");
    // Only url, answer, contentLength
    expect(Object.keys(ptc.sources[0]).sort()).toEqual(["answer", "contentLength", "url"]);
    // Top-level details unchanged
    expect(ptc.successCount).toBe(2);
    expect(ptc.totalCount).toBe(2);
    expect(ptc.responseId).toBe(result.details.responseId);
  });

  it("multi-URL+prompt ptcValue error entries have only url and error", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.com") {
        return { url, title: "A", content: "Content A", error: null };
      }
      return { url, title: null, content: "", error: "404 Not Found" };
    });
    state.filterContent.mockResolvedValue({
      filtered: "answer A",
      model: "anthropic/claude-haiku-4-5",
    });

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-multi-err",
      { urls: ["https://a.com", "https://b.com"], prompt: "question" },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    expect(ptc.sources).toHaveLength(2);
    // Success entry
    expect(Object.keys(ptc.sources[0]).sort()).toEqual(["answer", "contentLength", "url"]);
    // Error entry — only url and error
    expect(ptc.sources[1].url).toBe("https://b.com");
    expect(ptc.sources[1].error).toBe("404 Not Found");
    expect(Object.keys(ptc.sources[1]).sort()).toEqual(["error", "url"]);
  });

  it("multi-URL+prompt ptcValue filter-fallback entries retain url, title, content, filePath, contentLength", async () => {
    state.extractContent.mockImplementation(async (url: string) => ({
      url,
      title: `Title ${url}`,
      content: `Content ${url}`,
      error: null,
    }));
    state.filterContent.mockResolvedValueOnce({
      filtered: "answer A",
      model: "anthropic/claude-haiku-4-5",
    }).mockResolvedValueOnce({
      filtered: null,
      reason: "No filter model available (tried anthropic/claude-haiku-4-5)",
    });
    offloadState.offloadToFile.mockReturnValueOnce("/tmp/pi-web-fallback.txt");

    const tools = await getAllTools();
    const tool = tools.get("fetch_content")!;
    const result = await tool.execute(
      "call-multi-fallback",
      { urls: ["https://a.com", "https://b.com"], prompt: "question" },
      undefined, undefined, ctx
    );

    const ptc = result.details.ptcValue;
    expect(ptc.sources).toHaveLength(2);
    expect(ptc.prompt).toBe("question");
    // First: filtered success — minimal
    expect(Object.keys(ptc.sources[0]).sort()).toEqual(["answer", "contentLength", "url"]);
    // Second: filter fallback — retains content fields, no answer or error
    expect(ptc.sources[1].url).toBe("https://b.com");
    expect(ptc.sources[1].title).toBe("Title https://b.com");
    expect(ptc.sources[1].content).toBe("Content https://b.com");
    expect(ptc.sources[1].filePath).toBe("/tmp/pi-web-fallback.txt");
    expect(ptc.sources[1].contentLength).toBe("Content https://b.com".length);
    expect(ptc.sources[1]).not.toHaveProperty("answer");
    expect(ptc.sources[1]).not.toHaveProperty("error");
    expect(Object.keys(ptc.sources[1]).sort()).toEqual(["content", "contentLength", "filePath", "title", "url"]);
  });
```

Also verify existing tests for other paths (single-URL, no-prompt multi-URL) still reference `ptc.urls` — they should remain unchanged (AC 10).

**Step 2 — Run test, verify it fails**
Run: `npx vitest run ptc-value.test.ts`
Expected: FAIL — `expect(ptc.sources).toHaveLength(2)` fails because `ptc.sources` is `undefined` (current code emits `ptc.urls`)

**Step 3 — Write minimal implementation**

In `index.ts`, modify the multi-URL + prompt code path (lines ~632-690). Replace the `ptcUrls` array and its usage with the new shape.

Replace lines 635 through 688 with:

```typescript
          const ptcSources: Array<Record<string, unknown>> = [];
          const blocks = await Promise.all(
            results.map((r) =>
              limit(async () => {
                if (r.error) {
                  ptcSources.push({ url: r.url, error: r.error });
                  return `❌ ${r.url}: ${r.error}`;
                }
                const filterResult = await filterContent(
                  r.content,
                  prompt,
                  ctx.modelRegistry,
                  config.filterModel,
                  complete
                );
                if (filterResult.filtered !== null) {
                  ptcSources.push({ url: r.url, answer: filterResult.filtered, contentLength: filterResult.filtered.length });
                  return `Source: ${r.url}\n\n${filterResult.filtered}`;
                }
                const reason = filterResult.reason.startsWith("No filter model available")
                  ? "No filter model available. Returning raw content."
                  : filterResult.reason;

                const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
                try {
                  const filePath = offloadToFile(fullText);
                  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
                  ptcSources.push({ url: r.url, title: r.title, content: r.content, filePath, contentLength: r.content.length });
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
                  ptcSources.push({ url: r.url, title: r.title, content: r.content, filePath: null, contentLength: r.content.length });
                  return `⚠ Could not write temp file. Returning inline.\n\n${fullText}`;
                }
              })
            )
          );
          const successCount = results.filter((r) => !r.error).length;
          return {
            content: [{ type: "text", text: blocks.join("\n\n---\n\n") }],
            details: {
              responseId,
              successCount,
              totalCount: results.length,
              filtered: true,
              ptcValue: { responseId, prompt, sources: ptcSources, successCount, totalCount: results.length },
            },
          };
```

Key changes:
- `ptcUrls` → `ptcSources` (typed as `Array<Record<string, unknown>>` for flexibility)
- Filtered success: push `{ url, answer, contentLength }` only
- Error: push `{ url, error }` only
- Filter fallback: push `{ url, title, content, filePath, contentLength }`
- Top-level ptcValue: `urls` → `sources`, added `prompt`
- Text output (`blocks.join(...)`) and outer `details` shape unchanged

**Step 4 — Run test, verify it passes**
Run: `npx vitest run ptc-value.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
