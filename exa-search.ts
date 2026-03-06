import { retryFetch } from "./retry.js";

export interface ExaSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  type?: "auto" | "instant" | "deep" | "keyword";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
  detail?: "summary" | "highlights";
  maxAgeHours?: number;
}

const EXA_API_URL = "https://api.exa.ai/search";
const EXA_FIND_SIMILAR_URL = "https://api.exa.ai/findSimilar";
const DEFAULT_NUM_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

type ExaRawResult = {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  highlights?: unknown;
  summary?: unknown;
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
      snippet: (() => {
        if (typeof r.summary === "string" && r.summary) return r.summary;
        if (Array.isArray(r.highlights)) {
          const joined = r.highlights.filter((h): h is string => typeof h === "string").join(" ");
          if (joined) return joined;
        }
        if (typeof r.text === "string") return r.text;
        return "";
      })(),
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

  const requestBody: Record<string, unknown> = {
    query,
    numResults,
    contents: options.detail === "highlights"
      ? { highlights: { numSentences: 3, highlightsPerUrl: 3 } }
      : { summary: true },
  };

  // Pass type through directly; "auto" -> omit (Exa default)
  if (options.type && options.type !== "auto") {
    requestBody.type = options.type;
  }
  if (options.category) {
    requestBody.category = options.category;
  }
  if (options.includeDomains && options.includeDomains.length > 0) {
    requestBody.includeDomains = options.includeDomains;
  }
  if (options.excludeDomains && options.excludeDomains.length > 0) {
    requestBody.excludeDomains = options.excludeDomains;
  }
  if (options.maxAgeHours !== undefined) {
    requestBody.maxAgeHours = options.maxAgeHours;
  }

  const body = JSON.stringify(requestBody);

  let response: Response;
  try {
    response = await retryFetch(EXA_API_URL, {
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

export async function findSimilarExa(url: string, options: ExaSearchOptions): Promise<ExaSearchResult[]> {
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

  const requestBody: Record<string, unknown> = {
    url,
    numResults,
    contents: options.detail === "highlights"
      ? { highlights: { numSentences: 3, highlightsPerUrl: 3 } }
      : { summary: true },
  };
  if (options.includeDomains && options.includeDomains.length > 0) {
    requestBody.includeDomains = options.includeDomains;
  }
  if (options.excludeDomains && options.excludeDomains.length > 0) {
    requestBody.excludeDomains = options.excludeDomains;
  }

  const body = JSON.stringify(requestBody);

  let response: Response;
  try {
    response = await retryFetch(EXA_FIND_SIMILAR_URL, {
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
    throw new Error(`Exa findSimilar request failed for url "${url}": ${msg}`);
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
      parts.push(`   ${r.snippet}`);
      return parts.join("\n");
    })
    .join("\n\n");
}
