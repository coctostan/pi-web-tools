import { describe, it, expect, vi } from "vitest";
import { resolveFilterModel, filterContent } from "./filter.js";

describe("resolveFilterModel", () => {
  it("uses configured filterModel when available", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
    };

    const result = await resolveFilterModel(mockRegistry as any, "anthropic/claude-haiku-4-5");
    expect(result).toEqual({ model: mockModel, apiKey: "test-key" });
    expect(mockRegistry.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5");
  });

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
});


describe("filterContent", () => {
  it("returns filtered answer on successful completion", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
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

    expect(result).toEqual({ filtered: "The answer is 42. Explanation from content.", model: "anthropic/claude-haiku-4-5" });

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

  it("returns fallback when filter response is too short (< 20 chars)", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
    };

    const mockComplete = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "OK" }],
    });

    const result = await filterContent(
      "Some page content here",
      "What is this about?",
      mockRegistry as any,
      undefined,
      mockComplete
    );

    expect(result).toEqual({ filtered: null, reason: "Filter response too short (2 chars)" });
  });

  it("returns fallback when filter response is empty", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
    };

    const mockComplete = vi.fn().mockResolvedValue({
      content: [],
    });

    const result = await filterContent(
      "Some page content here",
      "What is this about?",
      mockRegistry as any,
      undefined,
      mockComplete
    );

    expect(result).toEqual({ filtered: null, reason: "Filter response too short (0 chars)" });
  });
});
