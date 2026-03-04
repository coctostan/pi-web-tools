---
id: 4
title: Add filterContent function — successful filtering
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - filter.ts
  - filter.test.ts
files_to_create: []
---

### Task 4: Add filterContent function — successful filtering [depends: 3]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts`:

```typescript
import { resolveFilterModel, filterContent } from "./filter.js";

describe("filterContent", () => {
  it("returns filtered answer on successful completion", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
    };

    const mockComplete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "The answer is 42." }],
    });

    const result = await filterContent(
      "This is a long page about the meaning of life...",
      "What is the answer?",
      mockRegistry as any,
      undefined,
      mockComplete
    );

    expect(result).toEqual({ filtered: "The answer is 42.", model: "anthropic/claude-haiku-4-5" });
    
    // Verify correct messages were passed to complete
    const [model, context, options] = mockComplete.mock.calls[0];
    expect(model).toBe(mockModel);
    expect(options.apiKey).toBe("test-key");
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0].role).toBe("user");
    // System prompt should be in context
    expect(context.systemPrompt).toBeDefined();
    expect(context.systemPrompt).toContain("ONLY");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — `filterContent is not a function` (not yet exported)

**Step 3 — Write minimal implementation**

Add to `filter.ts`:

```typescript
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";

type CompleteFn = (model: Model<Api>, context: Context, options?: ProviderStreamOptions) => Promise<AssistantMessage>;

export type FilterResult =
  | { filtered: string; model: string }
  | { filtered: null; reason: string };

const FILTER_SYSTEM_PROMPT = `You are a content extraction assistant. Your job is to answer the user's question using ONLY the provided page content.

Rules:
- Answer using ONLY information found in the provided content
- Include relevant code snippets verbatim — do not paraphrase or modify code
- Be concise and direct — typically 200-1000 characters
- If the content does not answer the question, say "The provided content does not contain information about [topic]."
- Do not use any knowledge from your training data — only the provided content`;

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
}
```

Also update the import at the top and ensure `ModelRegistry` type is imported properly. The full type import should use:

```typescript
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing
