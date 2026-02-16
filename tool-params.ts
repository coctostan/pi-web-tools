export function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

const VALID_SEARCH_TYPES = new Set(["auto", "instant", "deep"]);
const VALID_CATEGORIES = new Set([
  "company", "research paper", "news", "tweet",
  "people", "personal site", "financial report", "pdf",
]);

export function normalizeWebSearchInput(params: {
  query?: unknown;
  queries?: unknown;
  numResults?: unknown;
  type?: unknown;
  category?: unknown;
  includeDomains?: unknown;
  excludeDomains?: unknown;
}) {
  const query = typeof params.query === "string" ? params.query : undefined;
  const queries = Array.isArray(params.queries)
    ? params.queries.filter((q): q is string => typeof q === "string")
    : undefined;

  const queryList = (queries && queries.length > 0) ? queries : (query ? [query] : []);
  if (queryList.length === 0) {
    throw new Error("Either 'query' or 'queries' must be provided.");
  }

  const numResults = typeof params.numResults === "number" && Number.isFinite(params.numResults)
    ? params.numResults
    : undefined;

  const type = typeof params.type === "string" && VALID_SEARCH_TYPES.has(params.type)
    ? params.type as "auto" | "instant" | "deep"
    : undefined;

  const category = typeof params.category === "string" && VALID_CATEGORIES.has(params.category)
    ? params.category
    : undefined;

  const includeDomains = Array.isArray(params.includeDomains)
    ? params.includeDomains.filter((d): d is string => typeof d === "string")
    : undefined;

  const excludeDomains = Array.isArray(params.excludeDomains)
    ? params.excludeDomains.filter((d): d is string => typeof d === "string")
    : undefined;

  return { queries: queryList, numResults, type, category, includeDomains, excludeDomains };
}

export function normalizeFetchContentInput(params: { url?: unknown; urls?: unknown; forceClone?: unknown }) {
  const url = typeof params.url === "string" ? params.url : undefined;
  const urls = Array.isArray(params.urls)
    ? params.urls.filter((u): u is string => typeof u === "string")
    : undefined;

  const urlList = (urls && urls.length > 0) ? urls : (url ? [url] : []);
  if (urlList.length === 0) {
    throw new Error("Either 'url' or 'urls' must be provided.");
  }

  const forceClone = typeof params.forceClone === "boolean" ? params.forceClone : undefined;
  return { urls: dedupeUrls(urlList), forceClone };
}
