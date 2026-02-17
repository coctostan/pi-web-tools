export interface ExaContextResult {
  query: string;
  content: string;
}

export interface ExaContextOptions {
  apiKey: string | null;
  tokensNum?: number;
  signal?: AbortSignal;
}

const EXA_CONTEXT_URL = "https://api.exa.ai/context";
const DEFAULT_TIMEOUT_MS = 30_000;

export async function searchContext(query: string, options: ExaContextOptions): Promise<ExaContextResult> {
  if (options.apiKey === null) {
    throw new Error(
      "Exa API key not configured. Set the EXA_API_KEY environment variable or add \"exaApiKey\" to ~/.pi/web-tools.json"
    );
  }

  const signals: AbortSignal[] = [AbortSignal.timeout(DEFAULT_TIMEOUT_MS)];
  if (options.signal) {
    signals.push(options.signal);
  }
  const signal = AbortSignal.any(signals);

  const body = JSON.stringify({
    query,
    tokensNum: options.tokensNum ?? "dynamic",
  });

  let response: Response;
  try {
    response = await fetch(EXA_CONTEXT_URL, {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Context request failed for query "${query}": ${msg}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Exa Context API error (${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const content = typeof data?.response === "string" ? data.response : "";

  if (!content) {
    throw new Error(`Exa Context API returned empty or non-string response for query "${query}"`);
  }

  return { query, content };
}
