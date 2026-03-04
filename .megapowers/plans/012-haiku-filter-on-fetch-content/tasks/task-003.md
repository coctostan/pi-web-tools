---
id: 3
title: resolveFilterModel auto-detects Haiku then GPT-4o-mini
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - filter.ts
  - filter.test.ts
files_to_create: []
---

### Task 3: resolveFilterModel auto-detects Haiku then GPT-4o-mini [depends: 2]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts`:

```typescript
it("auto-detects Haiku when no config and Haiku key is available", async () => {
  const haikuModel = { id: "claude-haiku-4-5", provider: "anthropic" };
  const mockRegistry = {
    find: vi.fn().mockImplementation((provider: string, modelId: string) => {
      if (provider === "anthropic" && modelId === "claude-haiku-4-5") return haikuModel;
      return undefined;
    }),
    getApiKey: vi.fn().mockResolvedValue("haiku-key"),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: haikuModel, apiKey: "haiku-key" });
  expect(mockRegistry.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5");
});

it("falls back to GPT-4o-mini when Haiku is unavailable", async () => {
  const gptModel = { id: "gpt-4o-mini", provider: "openai" };
  const mockRegistry = {
    find: vi.fn().mockImplementation((provider: string, modelId: string) => {
      if (provider === "anthropic" && modelId === "claude-haiku-4-5") return undefined;
      if (provider === "openai" && modelId === "gpt-4o-mini") return gptModel;
      return undefined;
    }),
    getApiKey: vi.fn().mockResolvedValue("openai-key"),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: gptModel, apiKey: "openai-key" });
});

it("returns no-model when neither Haiku nor GPT-4o-mini is available", async () => {
  const mockRegistry = {
    find: vi.fn().mockReturnValue(undefined),
    getApiKey: vi.fn().mockResolvedValue(undefined),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: null, reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)" });
});

it("skips Haiku when model exists but no API key, falls to GPT-4o-mini", async () => {
  const haikuModel = { id: "claude-haiku-4-5", provider: "anthropic" };
  const gptModel = { id: "gpt-4o-mini", provider: "openai" };
  const mockRegistry = {
    find: vi.fn().mockImplementation((provider: string, modelId: string) => {
      if (provider === "anthropic" && modelId === "claude-haiku-4-5") return haikuModel;
      if (provider === "openai" && modelId === "gpt-4o-mini") return gptModel;
      return undefined;
    }),
    getApiKey: vi.fn().mockImplementation(async (model: any) => {
      if (model.id === "claude-haiku-4-5") return undefined;
      if (model.id === "gpt-4o-mini") return "openai-key";
      return undefined;
    }),
  };

  const result = await resolveFilterModel(mockRegistry as any, undefined);
  expect(result).toEqual({ model: gptModel, apiKey: "openai-key" });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — the auto-detect tests fail because `resolveFilterModel` currently returns `{ model: null, reason: "No filter model configured" }` when no configured model is passed.

**Step 3 — Write minimal implementation**

Update `resolveFilterModel` in `filter.ts` to add auto-detection fallback after the configured model check:

```typescript
const AUTO_DETECT_MODELS = [
  { provider: "anthropic", modelId: "claude-haiku-4-5" },
  { provider: "openai", modelId: "gpt-4o-mini" },
] as const;

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
        const apiKey = await registry.getApiKey(model);
        if (apiKey) {
          return { model, apiKey };
        }
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }

  // 2. Auto-detect: try each candidate
  for (const candidate of AUTO_DETECT_MODELS) {
    const model = registry.find(candidate.provider, candidate.modelId);
    if (!model) continue;
    const apiKey = await registry.getApiKey(model);
    if (apiKey) {
      return { model, apiKey };
    }
  }

  return { model: null, reason: `No filter model available (tried ${AUTO_DETECT_MODELS.map(m => `${m.provider}/${m.modelId}`).join(", ")})` };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing
