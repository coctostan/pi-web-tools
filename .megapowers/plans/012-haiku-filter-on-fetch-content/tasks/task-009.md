---
id: 9
title: Wire filterContent into fetch_content multi-URL path with p-limit(3)
status: approved
depends_on:
  - 5
  - 6
  - 8
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

### Task 9: Wire filterContent into fetch_content multi-URL path with p-limit(3) [depends: 5, 6, 8]

**Files:**
- Modify: `index.ts`
- Modify: `index.test.ts`
**Step 1 — Write the failing test**

In `index.test.ts`, add a mocked `p-limit` and two multi-URL tests (prompt mode + no-prompt regression). Keep using the same hoisted `state` mocks introduced in Task 8.

Add near top-level mocks:

```typescript
const pLimitState = vi.hoisted(() => ({
  pLimitSpy: vi.fn((concurrency: number) => {
    return <T>(fn: () => Promise<T>) => fn();
  }),
}));
vi.mock("p-limit", () => ({
  default: pLimitState.pLimitSpy,
}));
```

Add these tests in the `fetch_content` describe block:

```typescript
it("uses p-limit(3) and returns filtered + fallback blocks for multi-url prompt mode", async () => {
  state.extractContent.mockImplementation(async (url: string) => {
    if (url === "https://a.example/docs") {
      return { url, title: "A Docs", content: "RAW A", error: null };
    }
    if (url === "https://b.example/docs") {
      return { url, title: "B Docs", content: "RAW B", error: null };
    }
    return { url, title: "C Docs", content: "RAW C", error: null };
  });

  state.filterContent
    .mockResolvedValueOnce({
      filtered: "A: 100 requests/minute.",
      model: "anthropic/claude-haiku-4-5",
    })
    .mockResolvedValueOnce({
      filtered: null,
      reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)",
    })
    .mockResolvedValueOnce({
      filtered: "C: 60 requests/minute.",
      model: "anthropic/claude-haiku-4-5",
    });

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = {
    modelRegistry: {
      find: vi.fn(),
      getApiKey: vi.fn(),
    },
  } as any;

  const result = await fetchContentTool.execute(
    "call-multi",
    {
      urls: [
        "https://a.example/docs",
        "https://b.example/docs",
        "https://c.example/docs",
      ],
      prompt: "What are the rate limits?",
    },
    undefined,
    undefined,
    ctx
  );

  const text = getText(result);
  expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3);
  expect(state.filterContent).toHaveBeenCalledTimes(3);
  expect(state.filterContent).toHaveBeenNthCalledWith(
    1,
    "RAW A",
    "What are the rate limits?",
    ctx.modelRegistry,
    undefined,
    expect.any(Function)
  );
  expect(text).toContain("Source: https://a.example/docs\n\nA: 100 requests/minute.");
  expect(text).toContain("Source: https://c.example/docs\n\nC: 60 requests/minute.");
  expect(text).toContain(
    "⚠ No filter model available. Returning raw content.\n\n# B Docs\n\nRAW B"
  );
});

it("keeps existing multi-url summary behavior when prompt is omitted and does not call filterContent", async () => {
  state.extractContent.mockImplementation(async (url: string) => {
    if (url === "https://a.example/docs") {
      return { url, title: "A Docs", content: "RAW A", error: null };
    }
    if (url === "https://b.example/docs") {
      return { url, title: "B Docs", content: "RAW B", error: null };
    }
    return { url, title: "C Docs", content: "RAW C", error: "timeout" };
  });

  state.filterContent.mockReset();

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = {
    modelRegistry: {
      find: vi.fn(),
      getApiKey: vi.fn(),
    },
  } as any;

  const result = await fetchContentTool.execute(
    "call-no-prompt",
    {
      urls: [
        "https://a.example/docs",
        "https://b.example/docs",
        "https://c.example/docs",
      ],
    },
    undefined,
    undefined,
    ctx
  );

  const text = getText(result);

  expect(text).toContain("Fetched 2/3 URLs. Response ID:");
  expect(text).toContain("1. ✅ A Docs (5 chars)");
  expect(text).toContain("2. ✅ B Docs (5 chars)");
  expect(text).toContain("3. ❌ https://c.example/docs: timeout");
  expect(text).toContain("Use get_search_content with responseId");
  expect(state.filterContent).not.toHaveBeenCalled();
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`

Expected: FAIL — `expected text to contain "Fetched 2/3 URLs. Response ID:"`

**Step 3 — Write minimal implementation**

Implement prompt-aware multi-URL wiring in `index.ts`, while preserving the existing no-prompt summary path.
1. Add import at top of `index.ts`:
```typescript
import pLimit from "p-limit";
```

2. In `fetch_content` execute, replace the multi-URL branch with:

```typescript
// Multiple URLs
if (prompt) {
  const config = getConfig();
  const limit = pLimit(3);
  const blocks = await Promise.all(
    results.map((r) =>
      limit(async () => {
        if (r.error) {
          return `❌ ${r.url}: ${r.error}`;
        }
        const filterResult = await filterContent(
          r.content,
          prompt,
          ctx.modelRegistry,
          config.filterModel,
          complete
        );
      if (filterResult.filtered) {
          return `Source: ${r.url}\n\n${filterResult.filtered}`;
        }
        const reason = filterResult.reason.startsWith("No filter model available")
          ? "No filter model available. Returning raw content."
          : filterResult.reason;
        return `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
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
    },
  };
}
// No prompt: existing summary behavior (unchanged)
const successCount = results.filter((r) => !r.error).length;
const lines: string[] = [];
lines.push(`Fetched ${successCount}/${results.length} URLs. Response ID: ${responseId}`);
lines.push("");
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (r.error) {
    lines.push(`${i + 1}. ❌ ${r.url}: ${r.error}`);
  } else {
    lines.push(`${i + 1}. ✅ ${r.title} (${r.content.length} chars)`);
    lines.push(`   ${r.url}`);
  }
}

lines.push("");
lines.push(`Use get_search_content with responseId "${responseId}" and url/urlIndex to retrieve content.`);
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

Run: `npx vitest run index.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all passing
