---
id: 2
title: Migrate filter.ts to ModelRegistry.getApiKeyAndHeaders + thread headers
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - filter.ts
  - filter.test.ts
files_to_create: []
---

Addresses **Fixed When #2** (issue #027). `resolveFilterModel` switches from the removed `registry.getApiKey(model): Promise<string|undefined>` to `registry.getApiKeyAndHeaders(model): Promise<ResolvedRequestAuth>`, where:

```
type ResolvedRequestAuth =
  | { ok: true; apiKey?: string; headers?: Record<string,string> }
  | { ok: false; error: string };
```

`FilterModelResult.ok-branch` gains optional `headers`. `filterContent` threads `{ apiKey, headers }` into `completeFn`.

Imports stay on `@mariozechner/*` for this task (Task 5 flips the scope) — both legacy and new scopes expose the same `ResolvedRequestAuth` shape, so this task is independent of the rescope and runs first.

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing tests**

Replace the entire body of `filter.test.ts` with the following. The new tests assert the `getApiKeyAndHeaders` contract; the existing `getApiKey` mocks must go.

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveFilterModel, filterContent } from "./filter.js";

describe("resolveFilterModel", () => {
  it("uses configured filterModel and returns apiKey on ok:true", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
    };

    const result = await resolveFilterModel(mockRegistry as any, "anthropic/claude-haiku-4-5");
    expect(result).toEqual({ model: mockModel, apiKey: "test-key", headers: undefined });
    expect(mockRegistry.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5");
  });

  it("threads headers from ok:true response", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({
        ok: true,
        apiKey: "oauth-key",
        headers: { "anthropic-beta": "oauth-2025-04-20" },
      }),
    };

    const result = await resolveFilterModel(mockRegistry as any, "anthropic/claude-haiku-4-5");
    expect(result).toEqual({
      model: mockModel,
      apiKey: "oauth-key",
      headers: { "anthropic-beta": "oauth-2025-04-20" },
    });
  });

  it("returns no-model when getApiKeyAndHeaders returns ok:false", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: false, error: "no credential" }),
    };

    const result = await resolveFilterModel(mockRegistry as any, "anthropic/claude-haiku-4-5");
    expect(result).toEqual({
      model: null,
      reason: 'Configured filterModel "anthropic/claude-haiku-4-5" not available (no model or API key)',
    });
  });

  it("auto-detects Haiku when no config and Haiku key resolves ok:true", async () => {
    const haikuModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const mockRegistry = {
      find: vi.fn().mockImplementation((provider: string, modelId: string) => {
        if (provider === "anthropic" && modelId === "claude-haiku-4-5") return haikuModel;
        return undefined;
      }),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "haiku-key" }),
    };

    const result = await resolveFilterModel(mockRegistry as any, undefined);
    expect(result).toEqual({ model: haikuModel, apiKey: "haiku-key", headers: undefined });
  });

  it("falls back to GPT-4o-mini when Haiku auth fails", async () => {
    const haikuModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const gptModel = { id: "gpt-4o-mini", provider: "openai" };
    const mockRegistry = {
      find: vi.fn().mockImplementation((provider: string, modelId: string) => {
        if (provider === "anthropic" && modelId === "claude-haiku-4-5") return haikuModel;
        if (provider === "openai" && modelId === "gpt-4o-mini") return gptModel;
        return undefined;
      }),
      getApiKeyAndHeaders: vi.fn().mockImplementation(async (model: any) => {
        if (model.id === "claude-haiku-4-5") return { ok: false, error: "no key" };
        if (model.id === "gpt-4o-mini") return { ok: true, apiKey: "openai-key" };
        return { ok: false, error: "unknown" };
      }),
    };

    const result = await resolveFilterModel(mockRegistry as any, undefined);
    expect(result).toEqual({ model: gptModel, apiKey: "openai-key", headers: undefined });
  });

  it("returns no-model when neither candidate has a key", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(undefined),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: false, error: "missing" }),
    };

    const result = await resolveFilterModel(mockRegistry as any, undefined);
    expect(result).toEqual({
      model: null,
      reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)",
    });
  });
});

describe("filterContent", () => {
  const mockModel = {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com",
  };

  it("returns filtered answer and passes apiKey through to completeFn", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
    };
    const mockComplete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "The answer is 42. Explanation from content." }],
    });

    const result = await filterContent(
      "This is a long page about the meaning of life...",
      "What is the answer?",
      mockRegistry as any,
      undefined,
      mockComplete
    );

    expect(result).toEqual({
      filtered: "The answer is 42. Explanation from content.",
      model: "anthropic/claude-haiku-4-5",
    });

    const [model, context, options] = mockComplete.mock.calls[0];
    expect(model).toBe(mockModel);
    expect(options.apiKey).toBe("test-key");
    expect(options.headers).toBeUndefined();
    expect(context.systemPrompt).toContain("ONLY");
  });

  it("threads headers through to completeFn", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({
        ok: true,
        apiKey: "oauth-key",
        headers: { "anthropic-beta": "oauth-2025-04-20" },
      }),
    };
    const mockComplete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Long enough answer for the threshold." }],
    });

    await filterContent("page", "q", mockRegistry as any, undefined, mockComplete);

    const [, , options] = mockComplete.mock.calls[0];
    expect(options).toEqual({
      apiKey: "oauth-key",
      headers: { "anthropic-beta": "oauth-2025-04-20" },
    });
  });

  it("returns fallback when getApiKeyAndHeaders fails", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: false, error: "denied" }),
    };
    const mockComplete = vi.fn();

    const result = await filterContent(
      "Some content",
      "What is this?",
      mockRegistry as any,
      "anthropic/claude-haiku-4-5",
      mockComplete
    );

    expect(result.filtered).toBeNull();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("returns fallback when complete() throws an error", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
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

  it("returns fallback when filter response is too short (< 20 chars)", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
    };
    const mockComplete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "OK" }],
    });

    const result = await filterContent("page", "q", mockRegistry as any, undefined, mockComplete);
    expect(result).toEqual({ filtered: null, reason: "Filter response too short (2 chars)" });
  });

  it("returns fallback when filter response is empty", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
    };
    const mockComplete = vi.fn().mockResolvedValue({ content: [] });

    const result = await filterContent("page", "q", mockRegistry as any, undefined, mockComplete);
    expect(result).toEqual({ filtered: null, reason: "Filter response too short (0 chars)" });
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — assertions including:
- `AssertionError: expected { model: …, apiKey: 'test-key' } to deeply equal { model: …, apiKey: 'test-key', headers: undefined }` (existing `resolveFilterModel` returns 2 keys, test asserts 3)
- For the new headers test: `expected undefined to equal { 'anthropic-beta': 'oauth-2025-04-20' }`
- For `ok:false` test: the prod path still calls `registry.getApiKey` (not on mock) → `TypeError: registry.getApiKey is not a function`

Concrete first error printed (from the rewritten suite): `TypeError: registry.getApiKey is not a function` thrown from `filter.ts:42` when the `ok:true` test runs against unchanged `filter.ts`.

**Step 3 — Write minimal implementation**

Replace `filter.ts` content with:

```ts
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";

type MinimalModel = { id: string; provider: string };

export type FilterModelResult =
  | { model: MinimalModel; apiKey: string; headers?: Record<string, string> }
  | { model: null; reason: string };

const AUTO_DETECT_MODELS = [
  { provider: "anthropic", modelId: "claude-haiku-4-5" },
  { provider: "openai", modelId: "gpt-4o-mini" },
] as const;

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

const MIN_FILTER_RESPONSE_LENGTH = 20;

async function tryResolve(
  registry: ModelRegistry,
  model: MinimalModel
): Promise<{ apiKey: string; headers?: Record<string, string> } | null> {
  const auth = await registry.getApiKeyAndHeaders(model as Model<Api>);
  if (auth.ok && auth.apiKey) {
    return { apiKey: auth.apiKey, headers: auth.headers };
  }
  return null;
}

export async function resolveFilterModel(
  registry: ModelRegistry,
  configuredModel?: string
): Promise<FilterModelResult> {
  // 1. Try configured model
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (provider && modelId) {
      const model = registry.find(provider, modelId);
      if (model) {
        const auth = await tryResolve(registry, model);
        if (auth) {
          return { model, apiKey: auth.apiKey, headers: auth.headers };
        }
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }

  // 2. Auto-detect: try each candidate
  for (const candidate of AUTO_DETECT_MODELS) {
    const model = registry.find(candidate.provider, candidate.modelId);
    if (!model) continue;
    const auth = await tryResolve(registry, model);
    if (auth) {
      return { model, apiKey: auth.apiKey, headers: auth.headers };
    }
  }

  return { model: null, reason: `No filter model available (tried ${AUTO_DETECT_MODELS.map(m => `${m.provider}/${m.modelId}`).join(", ")})` };
}

export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn
): Promise<FilterResult> {
  const resolved = await resolveFilterModel(registry, configuredModel);
  if (!resolved.model) {
    return { filtered: null, reason: resolved.reason };
  }

  const { model, apiKey, headers } = resolved as {
    model: Model<Api>;
    apiKey: string;
    headers?: Record<string, string>;
  };

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
    const response = await completeFn(model, context, { apiKey, headers });
    const answer = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    if (answer.length < MIN_FILTER_RESPONSE_LENGTH) {
      return { filtered: null, reason: `Filter response too short (${answer.length} chars)` };
    }
    return { filtered: answer, model: `${model.provider}/${model.id}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filtered: null, reason: `Filter model error: ${msg}` };
  }
}
```

Note: The `ResolvedRequestAuth` type isn't exported with a public name everywhere across the legacy snapshot — we get type-safety from the **structural** `auth.ok && auth.apiKey` check rather than an explicit annotation. The runtime path is fully covered by tests; the type assertion `model as Model<Api>` matches the pre-existing pattern.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS — all 10 tests in `filter.test.ts` green.

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: All tests passing. Count grows from 258 → ~259 (one extra test for the headers case; the other replacements are 1:1).
