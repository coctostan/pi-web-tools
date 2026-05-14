---
id: 3
title: Expose configured filterModel on cache hits
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers AC 4, AC 5, AC 9, AC 10, AC 12.

**Files:**
- Modify: `index.test.ts`
- Modify: `index.ts`

**Step 1 — Write the failing test**
In `index.test.ts`, inside `describe("fetch_content research cache integration", ...)`, add this test after `returns cached answer on cache hit without calling extractContent or filterContent`:

```ts
  it("returns configured-model cache hit with filterModel detail", async () => {
    cacheState.getCachedForModels.mockReturnValueOnce("Cached answer from configured model.");

    const previousFilterModel = configState.value.filterModel;
    configState.value.filterModel = "openai-codex/gpt-5.4-mini";
    try {
      const { fetchContentTool } = await getFetchContentTool();
      const ctx = {
        modelRegistry: { find: vi.fn(), getApiKeyAndHeaders: vi.fn() },
      } as any;

      const result = await fetchContentTool.execute(
        "call-configured-cache-hit",
        { url: "https://docs.example.com/api", prompt: "What is the rate limit?" },
        undefined,
        undefined,
        ctx
      );

      expect(cacheState.getCachedForModels).toHaveBeenCalledWith(
        "https://docs.example.com/api",
        "What is the rate limit?",
        ["openai-codex/gpt-5.4-mini"],
        1440,
        expect.any(String)
      );
      expect(state.extractContent).not.toHaveBeenCalled();
      expect(state.filterContent).not.toHaveBeenCalled();
      expect(result.details.cached).toBe(true);
      expect(result.details.filterModel).toBe("openai-codex/gpt-5.4-mini");
      expect(getText(result)).toContain("Cached answer from configured model.");
    } finally {
      configState.value.filterModel = previousFilterModel;
    }
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "returns configured-model cache hit with filterModel detail"`
Expected: FAIL — `AssertionError: expected undefined to be 'openai-codex/gpt-5.4-mini'`

**Step 3 — Write minimal implementation**
If Task 2 was implemented exactly as written, the single-URL cached-hit `details` object in `index.ts` already includes:

```ts
                  filterModel: config.filterModel,
```

If it does not, add that property to the cached-hit return details immediately after `cached: true`:

```ts
                details: {
                  responseId,
                  url: dedupedUrls[0],
                  charCount: cachedAnswer.length,
                  filtered: true,
                  cached: true,
                  filterModel: config.filterModel,
                  ptcValue: { responseId, urls: [{ url: dedupedUrls[0], title: null, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null }], successCount: 1, totalCount: 1 },
                },
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "returns configured-model cache hit with filterModel detail"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
