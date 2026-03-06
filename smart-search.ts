export interface EnhancedQuery {
  originalQuery: string;
  finalQuery: string;
  queryChanged: boolean;
  typeOverride?: "keyword";
  appliedRules: string[];
}

const CODING_TERMS = new Set([
  "react",
  "vite",
  "vitest",
  "typescript",
  "javascript",
  "node",
  "npm",
  "pnpm",
  "yarn",
  "next",
  "nextjs",
  "tailwind",
  "eslint",
  "jest",
  "webpack",
  "tsconfig",
  "docker",
  "kubernetes",
  "python",
  "django",
  "flask",
  "rust",
  "cargo",
  "go",
  "java",
]);

function words(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

function looksErrorLike(query: string): boolean {
  return /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError)\s*:/i.test(query)
    || /Cannot\s+read\s+properties/i.test(query)
    || /\b[a-zA-Z_$][\w$]*\s+is\s+not\s+(?:defined|a function)\b/i.test(query)
    || /^\s*at\s+\S.+$/m.test(query);
}

function looksCodingQuery(query: string): boolean {
  const tokens = words(query).map((token) => token.toLowerCase());
  return tokens.some((token) => CODING_TERMS.has(token));
}

function isVagueCodingQuery(query: string): boolean {
  const count = words(query).length;
  return count >= 1 && count <= 3 && looksCodingQuery(query);
}

function expandQuery(query: string): string {
  return `${query.trim()} docs example`;
}

export function enhanceQuery(query: string): EnhancedQuery {
  const originalQuery = query;

  if (looksErrorLike(query)) {
    return {
      originalQuery,
      finalQuery: originalQuery,
      queryChanged: false,
      typeOverride: "keyword",
      appliedRules: ["error-like"],
    };
  }

  if (isVagueCodingQuery(query)) {
    const finalQuery = expandQuery(query);
    return {
      originalQuery,
      finalQuery,
      queryChanged: finalQuery !== originalQuery,
      appliedRules: ["vague-coding-query"],
    };
  }

  return {
    originalQuery,
    finalQuery: originalQuery,
    queryChanged: false,
    appliedRules: [],
  };
}

export interface PostProcessedResults<T extends { url: string; snippet: string }> {
  results: T[];
  duplicatesRemoved: number;
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

function normalizeUrlForDedup(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        parsed.searchParams.delete(key);
      }
    }

    const pathname = parsed.pathname !== "/" && parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;

    const search = parsed.searchParams.toString();
    return `${parsed.origin}${pathname}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

function cleanSnippet(snippet: string): string {
  let cleaned = snippet;

  cleaned = cleaned.replace(/^\s*(?:[^>\n]+\s>\s){2,}[^.]*\.?\s*/i, "");
  cleaned = cleaned.replace(/\bLast updated\s+[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\.?\s*/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || snippet;
}

export function postProcessResults<T extends { url: string; snippet: string }>(results: T[]): PostProcessedResults<T> {
  const seen = new Set<string>();
  const kept: T[] = [];
  let duplicatesRemoved = 0;

  for (const result of results) {
    const safeUrl = typeof (result as any).url === "string" ? (result as any).url : "";
    const safeSnippet = typeof (result as any).snippet === "string" ? (result as any).snippet : "";
    const cleaned = {
      ...result,
      url: safeUrl,
      snippet: cleanSnippet(safeSnippet),
    } as T;

    const normalized = safeUrl ? normalizeUrlForDedup(safeUrl) : null;
    if (normalized === null) {
      kept.push(cleaned);
      continue;
    }
    if (seen.has(normalized)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(normalized);
    kept.push(cleaned);
  }

  return { results: kept, duplicatesRemoved };
}