---
id: 1
title: Refresh filter model resolution contract
status: approved
depends_on: []
no_test: false
files_to_modify:
  - filter.test.ts
  - filter.ts
files_to_create: []
---

Covers AC 1, AC 2, AC 3, AC 4, AC 5, AC 6, AC 7, AC 8, AC 9, AC 10, AC 11, AC 12, AC 13, AC 14.

**Files:**
- Modify: `filter.test.ts`
- Modify: `filter.ts`
- Test: `filter.test.ts`

**Step 1 — Write the failing test**
Replace the current `describe("resolveFilterModel", ...)` block in `filter.test.ts` with this block, and update the first `filterContent` test to pass and assert `signal` as shown below.

```ts
const AUTO_DETECT_CANDIDATES = [
  { provider: "anthropic-cc", modelId: "claude-haiku-4-5" },
  { provider: "openai-codex", modelId: "gpt-5.4-mini" },
  { provider: "xiaomi", modelId: "mimo-v2.5-pro" },
] as const;

type Candidate = (typeof AUTO_DETECT_CANDIDATES)[number];

function candidateModel(candidate: Candidate) {
  return { id: candidate.modelId, provider: candidate.provider };
}

function createAutoDetectRegistry(options: {
  available?: readonly Candidate[];
  authenticated?: readonly Candidate[];
}) {
  const available = options.available ?? AUTO_DETECT_CANDIDATES;
  const authenticated = options.authenticated ?? available;
  return {
    find: vi.fn().mockImplementation((provider: string, modelId: string) => {
      const candidate = available.find((c) => c.provider === provider && c.modelId === modelId);
      return candidate ? candidateModel(candidate) : undefined;
    }),
    getApiKeyAndHeaders: vi.fn().mockImplementation(async (model: any) => {
      const isAuthenticated = authenticated.some((c) => c.provider === model.provider && c.modelId === model.id);
      return isAuthenticated ? { ok: true, apiKey: `${model.provider}-key` } : { ok: false, error: "missing" };
    }),
  };
}

describe("resolveFilterModel", () => {
  it("uses configured filterModel and returns apiKey on ok:true", async () => {
    const mockModel = { id: "custom-model", provider: "custom-provider" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key" }),
    };

    const result = await resolveFilterModel(mockRegistry as any, "custom-provider/custom-model");
    expect(result).toEqual({ model: mockModel, apiKey: "test-key", headers: undefined });
    expect(mockRegistry.find).toHaveBeenCalledWith("custom-provider", "custom-model");
  });

  it("threads headers from ok:true response", async () => {
    const mockModel = { id: "custom-model", provider: "custom-provider" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({
        ok: true,
        apiKey: "oauth-key",
        headers: { "anthropic-beta": "oauth-2025-04-20" },
      }),
    };

    const result = await resolveFilterModel(mockRegistry as any, "custom-provider/custom-model");
    expect(result).toEqual({
      model: mockModel,
      apiKey: "oauth-key",
      headers: { "anthropic-beta": "oauth-2025-04-20" },
    });
  });

  it("returns no-model when getApiKeyAndHeaders returns ok:false", async () => {
    const mockModel = { id: "custom-model", provider: "custom-provider" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: false, error: "no credential" }),
    };

    const result = await resolveFilterModel(mockRegistry as any, "custom-provider/custom-model");
    expect(result).toEqual({
      model: null,
      reason: 'Configured filterModel "custom-provider/custom-model" not available (no model or API key)',
    });
  });

  it("auto-detects the first candidate when no config and credentials resolve ok:true", async () => {
    const [first] = AUTO_DETECT_CANDIDATES;
    const mockRegistry = createAutoDetectRegistry({ authenticated: [first] });

    const result = await resolveFilterModel(mockRegistry as any, undefined);

    expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
    expect(result).toEqual({ model: candidateModel(first), apiKey: `${first.provider}-key`, headers: undefined });
  });

  it("falls back to the second candidate when the first candidate auth fails", async () => {
    const [first, second] = AUTO_DETECT_CANDIDATES;
    const mockRegistry = createAutoDetectRegistry({ authenticated: [second] });

    const result = await resolveFilterModel(mockRegistry as any, undefined);

    expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
    expect(mockRegistry.find).toHaveBeenNthCalledWith(2, second.provider, second.modelId);
    expect(result).toEqual({ model: candidateModel(second), apiKey: `${second.provider}-key`, headers: undefined });
  });

  it("falls back to the third candidate when earlier candidates auth fail", async () => {
    const [first, second, third] = AUTO_DETECT_CANDIDATES;
    const mockRegistry = createAutoDetectRegistry({ authenticated: [third] });

    const result = await resolveFilterModel(mockRegistry as any, undefined);

    expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
    expect(mockRegistry.find).toHaveBeenNthCalledWith(2, second.provider, second.modelId);
    expect(mockRegistry.find).toHaveBeenNthCalledWith(3, third.provider, third.modelId);
    expect(result).toEqual({ model: candidateModel(third), apiKey: `${third.provider}-key`, headers: undefined });
  });

  it("returns no-model when none of the auto-detect candidates has credentials", async () => {
    const mockRegistry = createAutoDetectRegistry({ authenticated: [] });

    const result = await resolveFilterModel(mockRegistry as any, undefined);

    expect(result).toEqual({
      model: null,
      reason: "No filter model available (tried anthropic-cc/claude-haiku-4-5, openai-codex/gpt-5.4-mini, xiaomi/mimo-v2.5-pro)",
    });
  });
});
```

Then replace the first `filterContent` test with this complete test:

```ts
  it("returns filtered answer and passes apiKey, headers, and signal through to completeFn", async () => {
    const signal = new AbortController().signal;
    const mockRegistry = {
      find: vi.fn().mockImplementation((provider: string, modelId: string) => {
        if (provider === "anthropic-cc" && modelId === "claude-haiku-4-5") return mockModel;
        return undefined;
      }),
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
      mockComplete,
      signal
    );

    expect(result).toEqual({
      filtered: "The answer is 42. Explanation from content.",
      model: "anthropic-cc/claude-haiku-4-5",
    });

    const [model, context, options] = mockComplete.mock.calls[0];
    expect(model).toBe(mockModel);
    expect(options.apiKey).toBe("test-key");
    expect(options.headers).toBeUndefined();
    expect(options.signal).toBe(signal);
    expect(context.systemPrompt).toContain("ONLY");
  });
```

Then replace the existing `returns fallback when getApiKeyAndHeaders fails` test in the `filterContent` describe block with this complete test, using the real `filterContent(content, prompt, registry, configuredModel, completeFn, signal?)` signature:

```ts
  it("returns fallback reason without calling completeFn when filter model resolution fails", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: false, error: "denied" }),
    };
    const mockComplete = vi.fn();

    const result = await filterContent(
      "Some content",
      "What is this?",
      mockRegistry as any,
      "anthropic-cc/claude-haiku-4-5",
      mockComplete
    );

    expect(result).toEqual({
      filtered: null,
      reason: 'Configured filterModel "anthropic-cc/claude-haiku-4-5" not available (no model or API key)',
    });
    expect(mockComplete).not.toHaveBeenCalled();
  });
```

Any other configured-model strings in the `filterContent` describe block that are meant to resolve `mockModel` must use `"anthropic-cc/claude-haiku-4-5"`, matching the updated `mockModel.provider` below.

Also update the `mockModel` constant in the `filterContent` describe block to:

```ts
  const mockModel = {
    id: "claude-haiku-4-5",
    provider: "anthropic-cc",
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com",
  };
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run filter.test.ts`
Expected: FAIL — Vitest reports the first auto-detect assertion against the current implementation, including `expected "spy" to be called with arguments: [ 'anthropic-cc', 'claude-haiku-4-5' ]` because current `filter.ts` still calls `registry.find("anthropic", "claude-haiku-4-5")` first.

**Step 3 — Write minimal implementation**
In `filter.ts`, replace the current `AUTO_DETECT_MODELS` declaration with:

```ts
const AUTO_DETECT_MODELS = [
  { provider: "anthropic-cc", modelId: "claude-haiku-4-5" },
  { provider: "openai-codex", modelId: "gpt-5.4-mini" },
  { provider: "xiaomi", modelId: "mimo-v2.5-pro" },
] as const;
```

Do not change `resolveFilterModel`, `filterContent`, the configured-model parsing path, `FilterModelResult`, or `FilterResult`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run filter.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
