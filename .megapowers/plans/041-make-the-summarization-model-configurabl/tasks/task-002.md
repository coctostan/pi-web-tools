---
id: 2
title: Skip auto-detect cache reads before effective model is known
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers AC 6, AC 8, AC 9, AC 12.

**Files:**
- Modify: `index.test.ts`
- Modify: `index.ts`

**Step 1 — Write the failing test**
In `index.test.ts`, inside `describe("fetch_content research cache integration", ...)`, replace the existing test named `passes default filter cache candidates in auto-detect order` with this test:

```ts
  it("skips cache read in auto-detect mode so stale answers from another model are not reused", async () => {
    cacheState.getCachedForModels.mockReturnValueOnce("Cached from a different model");
    state.filterContent.mockReset();
    state.filterContent.mockResolvedValueOnce({
      filtered: "Fresh answer from the effective model.",
      model: "anthropic-cc/claude-haiku-4-5",
    });

    const previousFilterModel = configState.value.filterModel;
    configState.value.filterModel = undefined;
    try {
      const { fetchContentTool } = await getFetchContentTool();
      const ctx = {
        modelRegistry: { find: vi.fn(), getApiKeyAndHeaders: vi.fn() },
      } as any;

      const result = await fetchContentTool.execute(
        "call-auto-detect-cache-skip",
        { url: "https://docs.example.com/api", prompt: "What is the rate limit?" },
        undefined,
        undefined,
        ctx
      );

      expect(cacheState.getCachedForModels).not.toHaveBeenCalled();
      expect(state.extractContent).toHaveBeenCalled();
      expect(state.filterContent).toHaveBeenCalledWith(
        "RAW PAGE CONTENT",
        "What is the rate limit?",
        ctx.modelRegistry,
        undefined,
        expect.any(Function),
        undefined
      );
      expect(cacheState.putCache).toHaveBeenCalledWith(
        "https://docs.example.com/api",
        "What is the rate limit?",
        "anthropic-cc/claude-haiku-4-5",
        "Fresh answer from the effective model.",
        1440,
        expect.any(String)
      );
      expect(getText(result)).toContain("Fresh answer from the effective model.");
      expect(getText(result)).not.toContain("Cached from a different model");
    } finally {
      configState.value.filterModel = previousFilterModel;
    }
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "skips cache read in auto-detect mode"`
Expected: FAIL — `AssertionError: expected "spy" to not be called at all, but actually been called 1 times`

**Step 3 — Write minimal implementation**
In `index.ts`, change the single-URL early cache check so it only runs when a configured model is present.

Replace the existing single-URL early cache block with:

```ts
        // Early cache check for single-URL + prompt is safe only when the effective model is configured.
        // In auto-detect mode, resolve/filter first so stale answers from another candidate are not reused.
        if (dedupedUrls.length === 1 && prompt && !noCache) {
          const config = getConfig();
          if (config.filterModel) {
            const cachedAnswer = getCachedForModels(dedupedUrls[0], prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
            if (cachedAnswer !== null) {
              const responseId = generateId();
              return {
                content: [{ type: "text", text: `Source: ${dedupedUrls[0]}\n\n${cachedAnswer}` }],
                details: {
                  responseId,
                  url: dedupedUrls[0],
                  charCount: cachedAnswer.length,
                  filtered: true,
                  cached: true,
                  ptcValue: { responseId, urls: [{ url: dedupedUrls[0], title: null, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null }], successCount: 1, totalCount: 1 },
                },
              };
            }
          }
        }
```

Also change the multi-URL prompt cache guard from:

```ts
                if (!noCache) {
                  const cachedAnswer = getCachedForModels(r.url, prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
```

 to:

```ts
                if (!noCache && config.filterModel) {
                  const cachedAnswer = getCachedForModels(r.url, prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "skips cache read in auto-detect mode"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
