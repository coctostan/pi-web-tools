---
id: 7
title: Batch web_search executes queries concurrently via p-limit(3)
status: approved
depends_on: []
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Covers spec AC 10, 11.
**Step 1 — Write the failing test**

Add to `index.test.ts` inside the existing `describe("web_search detail passthrough", ...)` block:

```typescript
  it("batch queries run concurrently via p-limit(3)", async () => {
    let seenConcurrency: number | undefined;
    pLimitState.pLimitSpy.mockImplementation((concurrency: number) => {
      seenConcurrency = concurrency;
      return <T>(fn: () => Promise<T>) => fn();
    });
    exaState.searchExa.mockResolvedValue([
      { title: "Result", url: "https://example.com", snippet: "test" },
    ]);
    exaState.formatSearchResults.mockReturnValue("formatted result");
    const { webSearchTool } = await getWebSearchTool();
    await webSearchTool.execute("call-batch", {
      queries: ["query1", "query2", "query3"],
    });
    expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
    expect(seenConcurrency).toBe(3);
    expect(exaState.searchExa).toHaveBeenCalledTimes(3);
  });
  it("batch query partial failure reports error and continues other queries", async () => {
    pLimitState.pLimitSpy.mockImplementation((_concurrency: number) => {
      return <T>(fn: () => Promise<T>) => fn();
    });
    exaState.searchExa
      .mockResolvedValueOnce([{ title: "Result 1", url: "https://example.com/1", snippet: "s1" }])
      .mockRejectedValueOnce(new Error("Exa API error (503)"))
      .mockResolvedValueOnce([{ title: "Result 3", url: "https://example.com/3", snippet: "s3" }]);
    exaState.formatSearchResults
      .mockReturnValueOnce("Result 1 formatted")
      .mockReturnValueOnce("Result 3 formatted");
    const { webSearchTool } = await getWebSearchTool();
    const result = await webSearchTool.execute("call-partial", {
      queries: ["q1", "q2", "q3"],
    });
    const text = getText(result);
    expect(text).toContain("## Query: q1");
    expect(text).toContain("Result 1 formatted");
    expect(text).toContain("## Query: q2");
    expect(text).toContain("Error: Exa API error (503)");
    expect(text).toContain("## Query: q3");
    expect(text).toContain("Result 3 formatted");
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`
Expected: FAIL — `AssertionError: expected "spy" to be called with arguments: [ 3 ]`
Why this fails now: `web_search` still uses a sequential `for` loop and never calls `pLimit(3)`.

**Step 3 — Write minimal implementation**

Modify `index.ts` in the `web_search` tool `execute` method. Replace the sequential loop with bounded concurrency.

Replace:

```typescript
        for (const q of queryList) {
          try {
            const searchResults = await searchExa(q, {
              apiKey: config.exaApiKey,
              numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
              type,
              category,
              includeDomains,
              excludeDomains,
              signal: combinedSignal,
              detail,
            });
            const formatted = formatSearchResults(searchResults);
            results.push({
              query: q,
              answer: formatted,
              results: searchResults.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet,
              })),
              error: null,
            });
            successfulQueries++;
            totalResults += searchResults.length;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({
              query: q,
              answer: "",
              results: [],
              error: msg,
            });
          }
        }
```

With:

```typescript
        const limit = pLimit(3);
        const resultPromises = queryList.map((q) =>
          limit(async (): Promise<QueryResultData> => {
            try {
              const searchResults = await searchExa(q, {
                apiKey: config.exaApiKey,
                numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
                type,
                category,
                includeDomains,
                excludeDomains,
                signal: combinedSignal,
                detail,
              });
              const formatted = formatSearchResults(searchResults);
              successfulQueries++;
              totalResults += searchResults.length;
              return {
                query: q,
                answer: formatted,
                results: searchResults.map((r) => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.snippet,
                })),
                error: null,
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                query: q,
                answer: "",
                results: [],
                error: msg,
              };
            }
          })
        );
        results.push(...(await Promise.all(resultPromises)));
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing
