import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";

type MinimalModel = { id: string; provider: string };

export type FilterModelResult =
  | { model: MinimalModel; apiKey: string }
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
    if (answer.length < MIN_FILTER_RESPONSE_LENGTH) {
      return { filtered: null, reason: `Filter response too short (${answer.length} chars)` };
    }
    return { filtered: answer, model: `${model.provider}/${model.id}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filtered: null, reason: `Filter model error: ${msg}` };
  }
}
