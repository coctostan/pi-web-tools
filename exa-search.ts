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

  const response = await fetch(EXA_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": options.apiKey,
      "Content-Type": "application/json",
    },
    body,
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Exa API error (${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const results: ExaSearchResult[] = (data.results ?? []).map(
    (r: { title?: string; url?: string; text?: string; publishedDate?: string }) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.text ?? "",
      publishedDate: r.publishedDate,
    })
  );

  return results;
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
