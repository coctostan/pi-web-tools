---
id: 10
title: "index.ts: integrate cache into multi-URL fetch_content + prompt flow"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

### Task 10: index.ts: integrate cache into multi-URL fetch_content + prompt flow [depends: 8]

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Add to `index.test.ts` inside the `fetch_content research cache integration` describe block:

```typescript
  it("multi-URL + prompt: independently checks cache per URL, mixing hits and misses", async () => {
    state.extractContent.mockImplementation(async (url: string) => {
      if (url === "https://a.example/docs") {
        return { url, title: "A Docs", content: "RAW A", error: null };
      }
      return { url, title: "B Docs", content: "RAW B", error: null };
    });

    // URL A: cache hit; URL B: cache miss
    cacheState.getCached.mockImplementation((url: string) => {
      if (url === "https://a.example/docs") return "Cached A answer";
      return null;
    });

    state.filterContent.mockReset();
    state.filterContent.mockResolvedValueOnce({
      filtered: "Fresh B answer",
      model: "anthropic/claude-haiku-4-5",
    });

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-multi-cache",
      {
        urls: ["https://a.example/docs", "https://b.example/docs"],
        prompt: "What are the rate limits?",
      },
      undefined,
      undefined,
      ctx
    );

    const text = getText(result);
    // URL A should come from cache
    expect(text).toContain("Cached A answer");
    // URL B should come from fresh filter
    expect(text).toContain("Fresh B answer");

    // filterContent should only be called for URL B (not A — it was cached)
    expect(state.filterContent).toHaveBeenCalledTimes(1);
    expect(state.filterContent).toHaveBeenCalledWith(
      "RAW B",
      "What are the rate limits?",
      ctx.modelRegistry,
      undefined,
      expect.any(Function)
    );

    // putCache should be called for URL B (fresh result)
    expect(cacheState.putCache).toHaveBeenCalledWith(
      "https://b.example/docs",
      "What are the rate limits?",
      "anthropic/claude-haiku-4-5",
      "Fresh B answer",
      1440,
      expect.any(String)
    );
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: FAIL — `expect(state.filterContent).toHaveBeenCalledTimes(1)` fails because cache is not checked in the multi-URL path yet (filterContent called for both URLs)

**Step 3 — Write minimal implementation**

In `index.ts`, in the multi-URL + prompt flow (around line 632, the `if (prompt)` block), add cache check before `filterContent` for each URL.

Replace the inner `limit(async () => { ... })` block (lines 638-676) with cache-aware logic:

```typescript
        if (prompt) {
          const config = getConfig();
          const limit = pLimit(3);
          const ptcUrls: Array<{ url: string, title: string | null, content: string | null, filtered: string | null, filePath: string | null, charCount: number | null, error: string | null }> = [];
          const blocks = await Promise.all(
            results.map((r) =>
              limit(async () => {
                if (r.error) {
                  ptcUrls.push({ url: r.url, title: null, content: null, filtered: null, filePath: null, charCount: null, error: r.error });
                  return `❌ ${r.url}: ${r.error}`;
                }

                // Check cache first (unless noCache)
                if (!noCache) {
                  const resolvedModel = config.filterModel ?? "anthropic/claude-haiku-4-5";
                  const cachedAnswer = getCached(r.url, prompt, resolvedModel, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
                  if (cachedAnswer !== null) {
                    ptcUrls.push({ url: r.url, title: r.title, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null });
                    return `Source: ${r.url}\n\n${cachedAnswer}`;
                  }
                }

                const filterResult = await filterContent(
                  r.content,
                  prompt,
                  ctx.modelRegistry,
                  config.filterModel,
                  complete
                );
                if (filterResult.filtered !== null) {
                  // Store in cache
                  putCache(r.url, prompt, filterResult.model, filterResult.filtered, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);

                  ptcUrls.push({ url: r.url, title: r.title, content: null, filtered: filterResult.filtered, filePath: null, charCount: filterResult.filtered.length, error: null });
                  return `Source: ${r.url}\n\n${filterResult.filtered}`;
                }

                // Filter failed — fallback (unchanged from existing logic)
                const reason = filterResult.reason.startsWith("No filter model available")
                  ? "No filter model available. Returning raw content."
                  : filterResult.reason;

                const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
                try {
                  const filePath = offloadToFile(fullText);
                  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
                  ptcUrls.push({ url: r.url, title: r.title, content: r.content, filtered: null, filePath, charCount: r.content.length, error: null });
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
                  ptcUrls.push({ url: r.url, title: r.title, content: r.content, filtered: null, filePath: null, charCount: r.content.length, error: null });
                  return `⚠ Could not write temp file. Returning inline.\n\n${fullText}`;
                }
              })
            )
          );
```

The rest of the multi-URL prompt block (success count calculation, return statement) remains unchanged.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
