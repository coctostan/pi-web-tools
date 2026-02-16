import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { searchExa, formatSearchResults } from "./exa-search.js";
import { extractContent, fetchAllContent } from "./extract.js";
import { extractGitHub, clearCloneCache, parseGitHubUrl } from "./github-extract.js";
import { getConfig, resetConfigCache } from "./config.js";
import { searchContext } from "./exa-context.js";
import {
  normalizeFetchContentInput,
  normalizeWebSearchInput,
  normalizeCodeSearchInput,
} from "./tool-params.js";
import {
  generateId,
  storeResult,
  getResult,
  getAllResults,
  clearResults,
  restoreFromSession,
  type StoredResultData,
  type QueryResultData,
  type ExtractedContent,
  type ContextResultData,
} from "./storage.js";

const MAX_INLINE_CONTENT = 30000;
const pendingFetches = new Map<string, AbortController>();
let sessionActive = false;

// ---------------------------------------------------------------------------
// Session event handlers
// ---------------------------------------------------------------------------

function abortAllPending(): void {
  for (const controller of pendingFetches.values()) {
    controller.abort();
  }
  pendingFetches.clear();
}

function handleSessionStart(ctx: ExtensionContext): void {
  abortAllPending();
  clearCloneCache();
  sessionActive = true;
  restoreFromSession(ctx);
}

function handleSessionShutdown(): void {
  sessionActive = false;
  abortAllPending();
  clearCloneCache();
  clearResults();
  resetConfigCache();
}

// ---------------------------------------------------------------------------
// Tool parameter schemas
// ---------------------------------------------------------------------------

const WebSearchParams = Type.Object({
  query: Type.Optional(Type.String({ description: "Single search query" })),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Multiple queries (batch)" })),
  numResults: Type.Optional(Type.Number({ description: "Results per query (default: 5, max: 20)" })),
  type: Type.Optional(Type.Union([
    Type.Literal("auto"),
    Type.Literal("instant"),
    Type.Literal("deep"),
  ], { description: 'Search type: "auto" (default, highest quality), "instant" (sub-150ms), "deep" (comprehensive research)' })),
  category: Type.Optional(Type.Union([
    Type.Literal("company"),
    Type.Literal("research paper"),
    Type.Literal("news"),
    Type.Literal("tweet"),
    Type.Literal("people"),
    Type.Literal("personal site"),
    Type.Literal("financial report"),
    Type.Literal("pdf"),
  ], { description: "Filter by content category" })),
  includeDomains: Type.Optional(Type.Array(Type.String(), { description: 'Only include these domains (e.g. ["github.com"])' })),
  excludeDomains: Type.Optional(Type.Array(Type.String(), { description: 'Exclude these domains (e.g. ["pinterest.com"])' })),
});

const FetchContentParams = Type.Object({
  url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
  forceClone: Type.Optional(Type.Boolean({ description: "Force cloning large GitHub repos" })),
});

const GetSearchContentParams = Type.Object({
  responseId: Type.String({ description: "Response ID from web_search or fetch_content" }),
  query: Type.Optional(Type.String({ description: "Get content for this query" })),
  queryIndex: Type.Optional(Type.Number({ description: "Get content for query at index" })),
  url: Type.Optional(Type.String({ description: "Get content for this URL" })),
  urlIndex: Type.Optional(Type.Number({ description: "Get content for URL at index" })),
});

const CodeSearchParams = Type.Object({
  query: Type.String({ description: "Describe what code you need" }),
  tokensNum: Type.Optional(Type.Number({ description: "Response size in tokens (default: auto, range: 50-100000)" })),
});

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Session event handlers
  pi.on("session_start", async (_event, ctx) => {
    handleSessionStart(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    handleSessionStart(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    handleSessionStart(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    handleSessionStart(ctx);
  });

  pi.on("session_shutdown", async () => {
    handleSessionShutdown();
  });

  const registrationConfig = getConfig();

  // -------------------------------------------------------------------------
  // Tool 1: web_search
  // -------------------------------------------------------------------------
  if (registrationConfig.tools.web_search) {
    pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for pages matching a query. Returns highlights (short relevant excerpts), not full page content. Use `fetch_content` to read a page in full. Supports batch searching with multiple queries.",
    parameters: WebSearchParams,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { queries: queryList, numResults, type, category, includeDomains, excludeDomains } = normalizeWebSearchInput(params);

      const config = getConfig();
      const abortController = new AbortController();
      const fetchId = generateId();
      pendingFetches.set(fetchId, abortController);

      const combinedSignal = signal
        ? AbortSignal.any([signal, abortController.signal])
        : abortController.signal;

      try {
        const results: QueryResultData[] = [];
        let successfulQueries = 0;
        let totalResults = 0;

        for (const q of queryList) {
          try {
            const searchResults = await searchExa(q, {
              apiKey: config.exaApiKey,
              numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
              type,
              category,
              includeDomains,
              excludeDomains,
              signal: combinedSignal,
            });
            const formatted = formatSearchResults(searchResults);
            results.push({
              query: q,
              answer: formatted,
              results: searchResults.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet,
              })),
              error: null,
            });
            successfulQueries++;
            totalResults += searchResults.length;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({
              query: q,
              answer: "",
              results: [],
              error: msg,
            });
          }
        }

        const searchId = generateId();
        const storedData: StoredResultData = {
          id: searchId,
          type: "search",
          timestamp: Date.now(),
          queries: results,
        };
        storeResult(searchId, storedData);
        pi.appendEntry("web-tools-results", storedData);

        // Format output text
        const textParts: string[] = [];
        for (const r of results) {
          textParts.push(`## Query: ${r.query}`);
          if (r.error) {
            textParts.push(`Error: ${r.error}`);
          } else {
            textParts.push(r.answer);
          }
          textParts.push("");
        }

        return {
          content: [{ type: "text", text: textParts.join("\n") }],
          details: {
            queryCount: queryList.length,
            successfulQueries,
            totalResults,
            searchId,
          },
        };
      } finally {
        pendingFetches.delete(fetchId);
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("search "));
      const queryText = args.queries
        ? args.queries.join(", ")
        : args.query || "";
      const truncated =
        queryText.length > 60 ? queryText.slice(0, 60) + "…" : queryText;
      text += theme.fg("accent", `"${truncated}"`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      if (result.isError) {
        const errText = result.content[0];
        const msg = errText?.type === "text" ? errText.text : "Error";
        return new Text(theme.fg("error", msg), 0, 0);
      }

      if (isPartial) {
        return new Text(theme.fg("warning", "Searching..."), 0, 0);
      }

      const details = result.details as {
        successfulQueries?: number;
        queryCount?: number;
        totalResults?: number;
      } | undefined;

      const successCount = details?.successfulQueries ?? 0;
      const totalCount = details?.queryCount ?? 0;
      const resultCount = details?.totalResults ?? 0;

      let text = theme.fg(
        "success",
        `${successCount}/${totalCount} queries succeeded, ${resultCount} sources`
      );

      if (expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          const preview = content.text.slice(0, 500);
          text += "\n" + theme.fg("dim", preview);
          if (content.text.length > 500) {
            text += theme.fg("muted", "...");
          }
        }
      }

      return new Text(text, 0, 0);
    },
    });
  }

  // -------------------------------------------------------------------------
  // Tool 2: fetch_content
  // -------------------------------------------------------------------------
  if (registrationConfig.tools.fetch_content) {
    pi.registerTool({
    name: "fetch_content",
    label: "Fetch Content",
    description:
      "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.",
    parameters: FetchContentParams,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { urls: dedupedUrls, forceClone } = normalizeFetchContentInput(params);

      const abortController = new AbortController();
      const fetchId = generateId();
      pendingFetches.set(fetchId, abortController);

      const combinedSignal = signal
        ? AbortSignal.any([signal, abortController.signal])
        : abortController.signal;

      try {
        const fetchOne = async (targetUrl: string): Promise<ExtractedContent> => {
          // Check if it's a GitHub URL
          const ghInfo = parseGitHubUrl(targetUrl);
          if (ghInfo) {
            const ghResult = await extractGitHub(targetUrl, combinedSignal, forceClone);
            if (ghResult) return ghResult;
            // Fall through to normal extraction if GitHub extraction returns null
          }
          return extractContent(targetUrl, combinedSignal);
        };

        let results: ExtractedContent[];
        if (dedupedUrls.length === 1) {
          results = [await fetchOne(dedupedUrls[0])];
        } else {
          results = await Promise.all(dedupedUrls.map(fetchOne));
        }

        const responseId = generateId();
        const storedData: StoredResultData = {
          id: responseId,
          type: "fetch",
          timestamp: Date.now(),
          urls: results,
        };
        storeResult(responseId, storedData);
        pi.appendEntry("web-tools-results", storedData);

        // Single URL: return content directly (possibly truncated)
        if (results.length === 1) {
          const r = results[0];
          if (r.error) {
            return {
              content: [{ type: "text", text: `Error fetching ${r.url}: ${r.error}` }],
              details: { responseId, url: r.url, error: r.error },
            };
          }

          let text = `# ${r.title}\n\n${r.content}`;
          let truncated = false;

          if (text.length > MAX_INLINE_CONTENT) {
            text = text.slice(0, MAX_INLINE_CONTENT);
            text += `\n\n[Content truncated at ${MAX_INLINE_CONTENT} chars. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
            truncated = true;
          }

          return {
            content: [{ type: "text", text }],
            details: {
              responseId,
              url: r.url,
              title: r.title,
              charCount: r.content.length,
              truncated,
            },
          };
        }

        // Multiple URLs: return summary
        const successCount = results.filter((r) => !r.error).length;
        const lines: string[] = [];
        lines.push(`Fetched ${successCount}/${results.length} URLs. Response ID: ${responseId}`);
        lines.push("");

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.error) {
            lines.push(`${i + 1}. ❌ ${r.url}: ${r.error}`);
          } else {
            lines.push(`${i + 1}. ✅ ${r.title} (${r.content.length} chars)`);
            lines.push(`   ${r.url}`);
          }
        }

        lines.push("");
        lines.push(`Use get_search_content with responseId "${responseId}" and url/urlIndex to retrieve content.`);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            responseId,
            successCount,
            totalCount: results.length,
          },
        };
      } finally {
        pendingFetches.delete(fetchId);
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("fetch "));
      if (args.urls && args.urls.length > 0) {
        text += theme.fg("accent", `${args.urls.length} URLs`);
      } else if (args.url) {
        const truncated =
          args.url.length > 60 ? args.url.slice(0, 60) + "…" : args.url;
        text += theme.fg("accent", truncated);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded: _expanded, isPartial }, theme) {
      if (result.isError) {
        const errText = result.content[0];
        const msg = errText?.type === "text" ? errText.text : "Error";
        return new Text(theme.fg("error", msg), 0, 0);
      }

      if (isPartial) {
        return new Text(theme.fg("warning", "Fetching..."), 0, 0);
      }

      const details = result.details as {
        title?: string;
        charCount?: number;
        truncated?: boolean;
        successCount?: number;
        totalCount?: number;
      } | undefined;

      // Multiple URLs
      if (details?.totalCount !== undefined) {
        const text = theme.fg(
          "success",
          `${details.successCount}/${details.totalCount} fetched`
        );
        return new Text(text, 0, 0);
      }

      // Single URL
      let text = "";
      if (details?.title) {
        text += theme.fg("success", details.title);
      }
      if (details?.charCount !== undefined) {
        text += theme.fg("dim", ` (${details.charCount} chars)`);
      }
      if (details?.truncated) {
        text += theme.fg("warning", " [truncated]");
      }

      return new Text(text || theme.fg("success", "Done"), 0, 0);
    },
    });
  }

  // -------------------------------------------------------------------------
  // Tool 3: get_search_content
  // -------------------------------------------------------------------------
  if (registrationConfig.tools.code_search) {
    pi.registerTool({
      name: "code_search",
      label: "Code Search",
      description:
        "Search GitHub repos, documentation, and Stack Overflow for working code examples. Use for framework usage, API syntax, library patterns, and setup recipes. Returns formatted code snippets, not web pages.",
      parameters: CodeSearchParams,

      async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
        const { query, tokensNum } = normalizeCodeSearchInput(params);

        const config = getConfig();
        const abortController = new AbortController();
        const fetchId = generateId();
        pendingFetches.set(fetchId, abortController);

        const combinedSignal = signal
          ? AbortSignal.any([signal, abortController.signal])
          : abortController.signal;

        try {
          const result = await searchContext(query, {
            apiKey: config.exaApiKey,
            tokensNum,
            signal: combinedSignal,
          });

          const responseId = generateId();
          const contextData: ContextResultData = {
            query: result.query,
            content: result.content,
            error: null,
          };
          const storedData: StoredResultData = {
            id: responseId,
            type: "context",
            timestamp: Date.now(),
            context: contextData,
          };
          storeResult(responseId, storedData);
          pi.appendEntry("web-tools-results", storedData);

          let text = result.content;
          let truncated = false;
          if (text.length > MAX_INLINE_CONTENT) {
            text = text.slice(0, MAX_INLINE_CONTENT);
            text += `\n\n[Content truncated. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
            truncated = true;
          }

          return {
            content: [{ type: "text", text }],
            details: {
              responseId,
              query: result.query,
              charCount: result.content.length,
              truncated,
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: `Error: ${msg}` }],
            isError: true,
            details: { query, error: msg },
          };
        } finally {
          pendingFetches.delete(fetchId);
        }
      },

      renderCall(args, theme) {
        let text = theme.fg("toolTitle", theme.bold("code_search "));
        const queryText = typeof args.query === "string" ? args.query : "";
        const truncated = queryText.length > 60 ? queryText.slice(0, 60) + "…" : queryText;
        text += theme.fg("accent", `"${truncated}"`);
        return new Text(text, 0, 0);
      },

      renderResult(result, { expanded, isPartial }, theme) {
        if (result.isError) {
          const errText = result.content[0];
          const msg = errText?.type === "text" ? errText.text : "Error";
          return new Text(theme.fg("error", msg), 0, 0);
        }

        if (isPartial) {
          return new Text(theme.fg("warning", "Searching code..."), 0, 0);
        }

        const details = result.details as {
          charCount?: number;
          truncated?: boolean;
          query?: string;
        } | undefined;

        let text = theme.fg("success", details?.query ?? "Done");
        if (details?.charCount !== undefined) {
          text += theme.fg("dim", ` (${details.charCount} chars)`);
        }
        if (details?.truncated) {
          text += theme.fg("warning", " [truncated]");
        }

        if (expanded) {
          const content = result.content[0];
          if (content?.type === "text") {
            const preview = content.text.slice(0, 500);
            text += "\n" + theme.fg("dim", preview);
            if (content.text.length > 500) {
              text += theme.fg("muted", "...");
            }
          }
        }

        return new Text(text, 0, 0);
      },
    });
  }

  if (registrationConfig.tools.get_search_content) {
    pi.registerTool({
    name: "get_search_content",
    label: "Get Content",
    description:
      "Retrieve full content from a previous web_search, code_search, or fetch_content result.",
    parameters: GetSearchContentParams,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { responseId, query, queryIndex, url, urlIndex } = params;

      const stored = getResult(responseId);
      if (!stored) {
        throw new Error(
          `No result found for responseId "${responseId}". Results may have expired or been cleared.`
        );
      }

      // Handle search results
      if (stored.type === "search" && stored.queries) {
        let targetQuery: QueryResultData | undefined;

        if (query !== undefined) {
          targetQuery = stored.queries.find((q) => q.query === query);
          if (!targetQuery) {
            const available = stored.queries.map((q) => q.query).join(", ");
            throw new Error(
              `Query "${query}" not found. Available queries: ${available}`
            );
          }
        } else if (queryIndex !== undefined) {
          if (queryIndex < 0 || queryIndex >= stored.queries.length) {
            throw new Error(
              `queryIndex ${queryIndex} out of range. Valid: 0-${stored.queries.length - 1}`
            );
          }
          targetQuery = stored.queries[queryIndex];
        } else {
          // Return all queries
          const lines: string[] = [];
          for (const q of stored.queries) {
            lines.push(`## Query: ${q.query}`);
            if (q.error) {
              lines.push(`Error: ${q.error}`);
            } else {
              lines.push(q.answer);
            }
            lines.push("");
          }
          return {
            content: [{ type: "text", text: lines.join("\n") }],
            details: { type: "search", queryCount: stored.queries.length },
          };
        }

        let text = `## Query: ${targetQuery.query}\n\n`;
        if (targetQuery.error) {
          text += `Error: ${targetQuery.error}`;
        } else {
          text += targetQuery.answer;
        }

        return {
          content: [{ type: "text", text }],
          details: {
            type: "search",
            query: targetQuery.query,
            resultCount: targetQuery.results.length,
          },
        };
      }

      // Handle fetch results
      if (stored.type === "fetch" && stored.urls) {
        let targetContent: ExtractedContent | undefined;

        if (url !== undefined) {
          targetContent = stored.urls.find((u) => u.url === url);
          if (!targetContent) {
            const available = stored.urls.map((u) => u.url).join("\n  ");
            throw new Error(
              `URL "${url}" not found. Available URLs:\n  ${available}`
            );
          }
        } else if (urlIndex !== undefined) {
          if (urlIndex < 0 || urlIndex >= stored.urls.length) {
            throw new Error(
              `urlIndex ${urlIndex} out of range. Valid: 0-${stored.urls.length - 1}`
            );
          }
          targetContent = stored.urls[urlIndex];
        } else {
          // Return summary of all URLs
          const lines: string[] = [];
          lines.push(`Fetch result contains ${stored.urls.length} URLs:`);
          lines.push("");
          for (let i = 0; i < stored.urls.length; i++) {
            const u = stored.urls[i];
            if (u.error) {
              lines.push(`${i}. ❌ ${u.url}: ${u.error}`);
            } else {
              lines.push(`${i}. ✅ ${u.title} (${u.content.length} chars)`);
              lines.push(`   ${u.url}`);
            }
          }
          lines.push("");
          lines.push("Specify url or urlIndex to retrieve full content.");
          return {
            content: [{ type: "text", text: lines.join("\n") }],
            details: { type: "fetch", urlCount: stored.urls.length },
          };
        }

        if (targetContent.error) {
          return {
            content: [
              { type: "text", text: `Error: ${targetContent.error}` },
            ],
            details: { type: "fetch", url: targetContent.url, error: targetContent.error },
          };
        }

        const text = `# ${targetContent.title}\n\n${targetContent.content}`;
        return {
          content: [{ type: "text", text }],
          details: {
            type: "fetch",
            url: targetContent.url,
            title: targetContent.title,
            charCount: targetContent.content.length,
          },
        };
      }

      // Handle context results
      if (stored.type === "context" && stored.context) {
        const ctx = stored.context;
        if (ctx.error) {
          return {
            content: [{ type: "text", text: `Error: ${ctx.error}` }],
            details: { type: "context", query: ctx.query, error: ctx.error },
          };
        }

        return {
          content: [{ type: "text", text: ctx.content }],
          details: {
            type: "context",
            query: ctx.query,
            charCount: ctx.content.length,
          },
        };
      }

      throw new Error(`Invalid stored result type for responseId "${responseId}".`);
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("get_content "));
      const target = args.query ?? args.url ?? `#${args.queryIndex ?? args.urlIndex ?? ""}`;
      const truncated = target.length > 40 ? target.slice(0, 40) + "…" : target;
      text += theme.fg("accent", truncated);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial: _isPartial }, theme) {
      if (result.isError) {
        const errText = result.content[0];
        const msg = errText?.type === "text" ? errText.text : "Error";
        return new Text(theme.fg("error", msg), 0, 0);
      }

      const details = result.details as {
        type?: string;
        query?: string;
        title?: string;
        charCount?: number;
        resultCount?: number;
        urlCount?: number;
        queryCount?: number;
      } | undefined;

      let label = "";
      let size = "";

      if (details?.query) {
        label = details.query;
        size = details.resultCount !== undefined ? `${details.resultCount} results` : "";
      } else if (details?.title) {
        label = details.title;
        size = details.charCount !== undefined ? `${details.charCount} chars` : "";
      } else if (details?.urlCount !== undefined) {
        label = `${details.urlCount} URLs`;
      } else if (details?.queryCount !== undefined) {
        label = `${details.queryCount} queries`;
      }

      let text = theme.fg("success", label);
      if (size) {
        text += theme.fg("dim", ` (${size})`);
      }

      if (expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          const preview = content.text.slice(0, 300);
          text += "\n" + theme.fg("dim", preview);
          if (content.text.length > 300) {
            text += theme.fg("muted", "...");
          }
        }
      }

      return new Text(text || theme.fg("success", "Done"), 0, 0);
    },
    });
  }
}
