---
id: 9
title: "index.ts: noCache bypasses cache read but still writes"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - index.test.ts
files_to_create: []
---

### Task 9: index.ts: noCache bypasses cache read but still writes [depends: 8]

**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

Add to `index.test.ts` inside the `fetch_content research cache integration` describe block:

```typescript
  it("noCache skips cache read but still writes to cache after fresh fetch", async () => {
    // Even though getCached would return a hit, noCache should skip it
    cacheState.getCached.mockReturnValueOnce("Should not be used");

    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-nocache",
      { url: "https://docs.example.com/api", prompt: "What is the rate limit?", noCache: true },
      undefined,
      undefined,
      ctx
    );

    // Cache read should NOT be called (noCache skips it)
    expect(cacheState.getCached).not.toHaveBeenCalled();

    // But fetch + filter SHOULD be called
    expect(state.extractContent).toHaveBeenCalled();
    expect(state.filterContent).toHaveBeenCalled();

    // And cache write SHOULD happen
    expect(cacheState.putCache).toHaveBeenCalledWith(
      "https://docs.example.com/api",
      "What is the rate limit?",
      "anthropic/claude-haiku-4-5",
      "Rate limit is 100/min.",
      1440,
      expect.any(String)
    );

    const text = getText(result);
    expect(text).toContain("Rate limit is 100/min.");
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts`
Expected: PASS — this should already pass since Task 8 added the `if (!noCache)` guard around `getCached`. If it does pass, this task simply adds explicit coverage for AC 8.

**Step 3 — No new implementation needed**

The `if (!noCache)` guard in Task 8 already handles this. The `putCache` call happens unconditionally when `filterResult.filtered !== null`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
