---
id: 5
title: filterContent handles API errors with graceful fallback
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - filter.ts
  - filter.test.ts
files_to_create: []
---

### Task 5: filterContent handles API errors with graceful fallback [depends: 4]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts` inside the `filterContent` describe block:

```typescript
it("returns fallback when complete() throws an error", async () => {
  const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
  const mockRegistry = {
    find: vi.fn().mockReturnValue(mockModel),
    getApiKey: vi.fn().mockResolvedValue("test-key"),
  };

  const mockComplete = vi.fn().mockRejectedValue(new Error("Rate limit exceeded"));

  const result = await filterContent(
    "Some page content",
    "What is this?",
    mockRegistry as any,
    undefined,
    mockComplete
  );

  expect(result).toEqual({ filtered: null, reason: "Filter model error: Rate limit exceeded" });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — unhandled rejection because `filterContent` does not catch errors from `completeFn`

**Step 3 — Write minimal implementation**

Wrap the `completeFn` call and response processing in a try-catch in `filterContent`:

```typescript
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn
): Promise<FilterResult> {
  const resolved = await resolveFilterModel(registry, configuredModel);
  if (!resolved.model || !("apiKey" in resolved)) {
    return { filtered: null, reason: resolved.reason };
  }

  const { model, apiKey } = resolved as { model: Model<Api>; apiKey: string };

  try {
    const context: Context = {
      systemPrompt: FILTER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `<page_content>\n${content}\n</page_content>\n\nQuestion: ${prompt}` }],
          timestamp: Date.now(),
        },
      ],
    };

    const response = await completeFn(model, context, { apiKey });

    const answer = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return { filtered: answer, model: `${model.provider}/${model.id}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filtered: null, reason: `Filter model error: ${msg}` };
  }
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing
