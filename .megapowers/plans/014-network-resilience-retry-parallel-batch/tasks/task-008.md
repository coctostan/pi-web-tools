---
id: 8
title: Multi-URL fetch_content uses p-limit(3) for bounded concurrency
status: approved
depends_on: []
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers spec AC 12.
**Step 1 — Write the failing test**

Add to `index.test.ts` inside an existing fetch-content describe block (for example, `describe("fetch_content file-first storage", ...)`).

```typescript
  it("multi-URL fetch uses p-limit(3) for bounded concurrency", async () => {
    let fetchPLimitConcurrency: number | undefined;
    pLimitState.pLimitSpy.mockImplementation((concurrency: number) => {
      fetchPLimitConcurrency = concurrency;
      return <T>(fn: () => Promise<T>) => fn();
    });

    state.extractContent.mockImplementation(async (url: string) => ({
      url,
      title: `Title for ${url}`,
      content: `Content for ${url}`,
      error: null,
    }));

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

    await fetchContentTool.execute(
      "call-multi",
      { urls: ["https://example.com/1", "https://example.com/2", "https://example.com/3"] },
      undefined,
      undefined,
      ctx
    );

    expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
    expect(fetchPLimitConcurrency).toBe(3);
    expect(state.extractContent).toHaveBeenCalledTimes(3);
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called with arguments: [ 3 ]`

Why this fails now: the multi-URL branch in `fetch_content` still uses `Promise.all(dedupedUrls.map(fetchOne))` without `pLimit`.

**Step 3 — Write minimal implementation**

Modify `index.ts` in the multi-URL branch of `fetch_content`.

Change:

```typescript
        let results: ExtractedContent[];
        if (dedupedUrls.length === 1) {
          results = [await fetchOne(dedupedUrls[0])];
        } else {
          results = await Promise.all(dedupedUrls.map(fetchOne));
        }
```

To:

```typescript
        let results: ExtractedContent[];
        if (dedupedUrls.length === 1) {
          results = [await fetchOne(dedupedUrls[0])];
        } else {
          const limit = pLimit(3);
          results = await Promise.all(dedupedUrls.map((url) => limit(() => fetchOne(url))));
        }
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
