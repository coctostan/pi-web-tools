export interface ExaSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  signal?: AbortSignal;
}

const EXA_API_URL = "https://api.exa.ai/search";
const DEFAULT_NUM_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

type ExaRawResult = {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  publishedDate?: unknown;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function parseExaResults(data: unknown): ExaSearchResult[] {
  if (!isRecord(data)) {
    throw new Error("Malformed Exa API response: expected object");
  }

  const raw = data.results;
  if (!Array.isArray(raw)) {
    throw new Error("Malformed Exa API response: results must be an array");
  }

  return raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Malformed Exa API response: results[${index}] must be an object`);
    }

    const r = entry as ExaRawResult;
    return {
      title: typeof r.title === "string" ? r.title : "",
      url: typeof r.url === "string" ? r.url : "",
      snippet: typeof r.text === "string" ? r.text : "",
      publishedDate: typeof r.publishedDate === "string" ? r.publishedDate : undefined,
    };
  });
}

export async function searchExa(query: string, options: ExaSearchOptions): Promise<ExaSearchResult[]> {
  if (options.apiKey === null) {
    throw new Error(
      "Exa API key not configured. Set the EXA_API_KEY environment variable or add \"exaApiKey\" to ~/.pi/web-tools.json"
    );
  }

  const numResults = options.numResults ?? DEFAULT_NUM_RESULTS;

  const signals: AbortSignal[] = [AbortSignal.timeout(DEFAULT_TIMEOUT_MS)];
  if (options.signal) {
    signals.push(options.signal);
  }
  const signal = AbortSignal.any(signals);

  const body = JSON.stringify({
    query,
    numResults,
    contents: { text: { maxCharacters: 1000 } },
  });

  let response: Response;
  try {
    response = await fetch(EXA_API_URL, {
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
    throw new Error(`Exa request failed for query "${query}": ${msg}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Exa API error (${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();
  return parseExaResults(data);
}

export function formatSearchResults(results: ExaSearchResult[]): string {
  if (results.length === 0) {
    return "No results found.";
  }

  return results
    .map((r, i) => {
      const parts: string[] = [];
      parts.push(`${i + 1}. **${r.title}**`);
      if (r.publishedDate) {
        parts.push(`   Date: ${r.publishedDate}`);
      }
      parts.push(`   ${r.url}`);
      const preview = r.snippet.length > 200 ? r.snippet.slice(0, 200) + "…" : r.snippet;
      parts.push(`   ${preview}`);
      return parts.join("\n");
    })
    .join("\n\n");
}
