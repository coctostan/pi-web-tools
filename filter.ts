import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";

type RequestAuth = {
  apiKey?: string;
  headers?: Record<string, string>;
};

type ResolvedRequestAuth =
  | ({ ok: true } & RequestAuth)
  | { ok: false; error: string };

export type FilterModelResult =
  | ({ model: Model<Api> } & RequestAuth)
  | { model: null; reason: string };

const FILTER_SYSTEM_PROMPT = `You are a content extraction assistant. Your job is to answer the user's question using ONLY the provided page content.

Rules:
- Answer using ONLY information found in the provided content
- Include relevant code snippets verbatim — do not paraphrase or modify code
- Be concise and direct — typically 200-1000 characters
- If the content does not answer the question, say "The provided content does not contain information about [topic]."
- Do not use any knowledge from your training data — only the provided content`;

const MIN_FILTER_RESPONSE_LENGTH = 20;

const AUTO_DETECT_MODELS = [
  { provider: "anthropic", modelId: "claude-haiku-4-5" },
  { provider: "openai", modelId: "gpt-4o-mini" },
] as const;

type CompleteFn = (
  model: Model<Api>,
  context: Context,
  options?: ProviderStreamOptions
) => Promise<AssistantMessage>;

export type FilterResult =
  | { filtered: string; model: string; reason?: never }
  | { filtered: null; reason: string; model?: never };

function hasRequestAuth(auth: RequestAuth): boolean {
  return Boolean(auth.apiKey) || (auth.headers !== undefined && Object.keys(auth.headers).length > 0);
}

async function getModelRequestAuth(
  registry: ModelRegistry,
  model: Model<Api>
): Promise<ResolvedRequestAuth> {
  try {
    return await registry.getApiKeyAndHeaders(model);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function buildFilterModelResult(model: Model<Api>, auth: RequestAuth): FilterModelResult {
  const result: { model: Model<Api>; apiKey?: string; headers?: Record<string, string> } = { model };
  if (auth.apiKey) result.apiKey = auth.apiKey;
  if (auth.headers && Object.keys(auth.headers).length > 0) result.headers = auth.headers;
  return result;
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
        const auth = await getModelRequestAuth(registry, model);
        if (auth.ok && hasRequestAuth(auth)) {
          return buildFilterModelResult(model, auth);
        }
        const authReason = auth.ok ? "no API key or request headers" : auth.error;
        return { model: null, reason: `Configured filterModel "${configuredModel}" not available (${authReason})` };
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model)` };
  }

  // 2. Auto-detect: try each candidate
  for (const candidate of AUTO_DETECT_MODELS) {
    const model = registry.find(candidate.provider, candidate.modelId);
    if (!model) continue;
    const auth = await getModelRequestAuth(registry, model);
    if (auth.ok && hasRequestAuth(auth)) {
      return buildFilterModelResult(model, auth);
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

  const { model, apiKey, headers } = resolved;

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
