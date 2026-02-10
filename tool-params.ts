export function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

export function normalizeWebSearchInput(params: { query?: unknown; queries?: unknown; numResults?: unknown }) {
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

  return { queries: queryList, numResults };
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
