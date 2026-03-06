import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { complete } from "@mariozechner/pi-ai";
import pLimit from "p-limit";
import { searchExa, findSimilarExa, formatSearchResults } from "./exa-search.js";
import { enhanceQuery, postProcessResults, type EnhancedQuery } from "./smart-search.js";
import { extractContent, fetchAllContent, clearUrlCache } from "./extract.js";
import { extractGitHub, clearCloneCache, parseGitHubUrl } from "./github-extract.js";
import { getConfig, resetConfigCache } from "./config.js";
import { searchContext } from "./exa-context.js";
import { filterContent } from "./filter.js";
import {
  normalizeFetchContentInput,
  normalizeWebSearchInput,
  normalizeCodeSearchInput,
  normalizeGetSearchContentInput,
} from "./tool-params.js";
import { truncateContent } from "./truncation.js";
import { shouldOffload, offloadToFile, buildOffloadResult, cleanupTempFiles, FILE_FIRST_PREVIEW_SIZE } from "./offload.js";
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
  clearUrlCache();
  cleanupTempFiles();
  restoreFromSession(ctx);
}

function handleSessionShutdown(): void {
  abortAllPending();
  clearCloneCache();
  clearResults();
  resetConfigCache();
  cleanupTempFiles();
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
  detail: Type.Optional(Type.Union([
    Type.Literal("summary"),
    Type.Literal("highlights"),
  ], { description: 'Detail level: "summary" (default) or "highlights"' })),
  freshness: Type.Optional(Type.Union([
    Type.Literal("realtime"),
    Type.Literal("day"),
    Type.Literal("week"),
    Type.Literal("any"),
  ], { description: 'Content freshness: "realtime" (0h), "day" (24h), "week" (168h), "any" (default, no filter)' })),
  similarUrl: Type.Optional(Type.String({ description: "Find pages similar to this URL (alternative to query)" })),
});

const FetchContentParams = Type.Object({
  url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
  forceClone: Type.Optional(Type.Boolean({ description: "Force cloning large GitHub repos" })),
  prompt: Type.Optional(Type.String({ description: "Question to answer from the fetched content. When provided, content is filtered through a cheap model and only the focused answer is returned (~200-1000 chars instead of full page)." })),
});

const GetSearchContentParams = Type.Object({
  responseId: Type.String({ description: "Response ID from web_search or fetch_content" }),
  query: Type.Optional(Type.String({ description: "Get content for this query" })),
  queryIndex: Type.Optional(Type.Number({ description: "Get content for query at index" })),
  url: Type.Optional(Type.String({ description: "Get content for this URL" })),
  urlIndex: Type.Optional(Type.Number({ description: "Get content for URL at index" })),
  maxChars: Type.Optional(Type.Number({ description: "Maximum characters to return (default: 30000, max: 100000)" })),
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

  // Tool result interception — offload large content to temp files
  pi.on("tool_result", async (event) => {
    // Only intercept our own tools
    const ourTools = new Set(["web_search", "fetch_content", "code_search", "get_search_content"]);
    if (!ourTools.has(event.toolName)) return;
    if (event.isError) return;

    // Check if any text content exceeds threshold
    const textContent = event.content.find(
      (c): c is { type: "text"; text: string } => c.type === "text"
    );
    if (!textContent || !shouldOffload(textContent.text)) return;

    // Offload to file
    const filePath = offloadToFile(textContent.text);
    const replacement = buildOffloadResult(textContent.text, filePath);

    return {
      content: [{ type: "text" as const, text: replacement }],
    };
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
      "Search the web for pages matching a query. Returns summaries by default (~1 line per result). Use `detail: \"highlights\"` for longer excerpts. Use `fetch_content` to read a page in full. Supports batch searching with multiple queries.",
    parameters: WebSearchParams,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { queries: queryList, numResults, type, category, includeDomains, excludeDomains, detail, maxAgeHours, similarUrl } = normalizeWebSearchInput(params);

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
        if (similarUrl) {
          // findSimilar mode — single request, no pLimit loop
          try {
            const searchResults = await findSimilarExa(similarUrl, {
              apiKey: config.exaApiKey,
              numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
              signal: combinedSignal,
              detail,
            });
            const formatted = formatSearchResults(searchResults);
            successfulQueries++;
            totalResults += searchResults.length;
            results.push({
              query: similarUrl,
              answer: formatted,
              results: searchResults.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet,
              })),
              error: null,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({
              query: similarUrl,
              answer: "",
              results: [],
              error: msg,
            });
          }
        } else {
          // Normal search mode — batch queries via pLimit
          const limit = pLimit(3);
          const resultPromises = queryList.map((q) =>
            limit(async (): Promise<QueryResultData> => {
              let enhanced: EnhancedQuery = {
                originalQuery: q,
                finalQuery: q,
                queryChanged: false,
                appliedRules: [],
                typeOverride: undefined,
              };

              try {
                enhanced = enhanceQuery(q);
              } catch {
                enhanced = {
                  originalQuery: q,
                  finalQuery: q,
                  queryChanged: false,
                  appliedRules: [],
                  typeOverride: undefined,
                };
              }

              try {
                const searchResults = await searchExa(enhanced.finalQuery, {
                  apiKey: config.exaApiKey,
                  numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
                  type: enhanced.typeOverride ?? type,
                  category,
                  includeDomains,
                  excludeDomains,
                  signal: combinedSignal,
                  detail,
                  maxAgeHours,
                });

                let processedResults = searchResults;
                let duplicatesRemoved = 0;

                try {
                  const processed = postProcessResults(searchResults);
                  processedResults = processed.results;
                  duplicatesRemoved = processed.duplicatesRemoved;
                } catch {
                  processedResults = searchResults;
                  duplicatesRemoved = 0;
                }

                const formatted = formatSearchResults(processedResults);
                const notes: string[] = [];

                if (enhanced.typeOverride === "keyword") {
                  notes.push("Keyword search used.");
                }
                if (enhanced.queryChanged) {
                  notes.push(`Searched as: ${enhanced.finalQuery}`);
                }

                const answer = notes.length > 0
                  ? `${notes.join("\n")}\n\n${formatted}`
                  : formatted;
                successfulQueries++;
                totalResults += processedResults.length;

                return {
                  query: q,
                  answer,
                  results: processedResults.map((r) => ({
                    title: r.title,
                    url: r.url,
                    snippet: r.snippet,
                  })),
                  error: null,
                };
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return {
                  query: q,
                  answer: "",
                  results: [],
                  error: msg,
                };
              }
            })
          );
          results.push(...(await Promise.all(resultPromises)));
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
        textParts.push(`Use get_search_content with responseId "${searchId}" and query/queryIndex to retrieve full content.`);

        return {
          content: [{ type: "text", text: textParts.join("\n") }],
          details: {
            queryCount: similarUrl ? 1 : queryList.length,
            successfulQueries,
            totalResults,
            responseId: searchId,
          },
        };
      } finally {
        pendingFetches.delete(fetchId);
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("search "));
      if (args.similarUrl) {
        const truncated = args.similarUrl.length > 60 ? args.similarUrl.slice(0, 60) + "…" : args.similarUrl;
        text += theme.fg("accent", `similar: ${truncated}`);
      } else {
        const queryText = args.queries
          ? args.queries.join(", ")
          : args.query || "";
        const truncated =
          queryText.length > 60 ? queryText.slice(0, 60) + "…" : queryText;
        text += theme.fg("accent", `"${truncated}"`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      if ((result as any).isError) {
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
      "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).\n\nRaw fetches (without `prompt`) return a preview + file path. Use `read` to explore the full content selectively.",
    parameters: FetchContentParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { urls: dedupedUrls, forceClone, prompt } = normalizeFetchContentInput(params);

      const abortController = new AbortController();
      const fetchId = generateId();
      pendingFetches.set(fetchId, abortController);

      const combinedSignal = signal
        ? AbortSignal.any([signal, abortController.signal])
        : abortController.signal;

      const githubCloneUrls = new Set<string>();

      try {
        const fetchOne = async (targetUrl: string): Promise<ExtractedContent> => {
          // Check if it's a GitHub URL
          const ghInfo = parseGitHubUrl(targetUrl);
          if (ghInfo) {
            const ghResult = await extractGitHub(targetUrl, combinedSignal, forceClone);
            if (ghResult) {
              githubCloneUrls.add(ghResult.url);
              return ghResult;
            }
            // Fall through to normal extraction if GitHub extraction returns null
          }
          return extractContent(targetUrl, combinedSignal);
        };

        let results: ExtractedContent[];
        if (dedupedUrls.length === 1) {
          results = [await fetchOne(dedupedUrls[0])];
        } else {
          const limit = pLimit(3);
          results = await Promise.all(dedupedUrls.map((url) => limit(() => fetchOne(url))));
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

          if (prompt) {
            const config = getConfig();
            const filterResult = await filterContent(
              r.content,
              prompt,
              ctx.modelRegistry,
              config.filterModel,
              complete
            );

            if (filterResult.filtered !== null) {
              return {
                content: [{ type: "text", text: `Source: ${r.url}\n\n${filterResult.filtered}` }],
                details: {
                  responseId,
                  url: r.url,
                  title: r.title,
                  charCount: filterResult.filtered.length,
                  filtered: true,
                  filterModel: filterResult.model,
                },
              };
            }

            const reason = filterResult.reason.startsWith("No filter model available")
              ? "No filter model available. Returning raw content."
              : filterResult.reason;

            const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
            try {
              const filePath = offloadToFile(fullText);
              const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
              return {
                content: [{
                  type: "text",
                  text: [
                    `# ${r.title}`,
                    `Source: ${r.url}`,
                    `⚠ ${reason}`,
                    "",
                    `${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`,
                    "",
                    `Full content saved to ${filePath} (${fullText.length} chars). Use \`read\` to explore further.`,
                  ].join("\n"),
                }],
                details: {
                  responseId,
                  url: r.url,
                  title: r.title,
                  charCount: r.content.length,
                  filtered: false,
                  filePath,
                },
              };
            } catch {
              return {
                content: [{ type: "text", text: `⚠ Could not write temp file. Returning inline.\n\n${fullText}` }],
                details: {
                  responseId,
                  url: r.url,
                  title: r.title,
                  charCount: r.content.length,
                  filtered: false,
                  fileFirstFailed: true,
                },
              };
          }
          }

          const isGitHubCloneResult = githubCloneUrls.has(r.url);
          if (isGitHubCloneResult) {
            return {
              content: [{ type: "text", text: `# ${r.title}\n\n${r.content}` }],
              details: {
                responseId,
                url: r.url,
                title: r.title,
                charCount: r.content.length,
              },
            };
          }
          // File-first: write raw content to temp file, return preview + path
          const fullText = `# ${r.title}\n\n${r.content}`;
          let filePath: string;
          try {
            filePath = offloadToFile(fullText);
          } catch {
            // Disk error fallback: return inline with warning
            return {
              content: [{ type: "text", text: `⚠ Could not write temp file. Returning inline.\n\n${fullText}` }],
              details: {
                responseId,
                url: r.url,
                title: r.title,
                charCount: r.content.length,
                fileFirstFailed: true,
              },
            };
          }

          const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
          const previewText = [
            `# ${r.title}`,
            `Source: ${r.url}`,
            ``,
            `${preview}`,
            fullText.length > FILE_FIRST_PREVIEW_SIZE ? "\n..." : "",
            ``,
            `Full content saved to ${filePath} (${fullText.length} chars). Use \`read\` to explore further.`,
          ].join("\n");
          return {
            content: [{ type: "text", text: previewText }],
            details: {
              responseId,
              url: r.url,
              title: r.title,
              charCount: r.content.length,
              filePath,
            },
          };
        }

        // Multiple URLs
        if (prompt) {
          const config = getConfig();
          const limit = pLimit(3);
          const blocks = await Promise.all(
            results.map((r) =>
              limit(async () => {
                if (r.error) {
                  return `❌ ${r.url}: ${r.error}`;
                }

                const filterResult = await filterContent(
                  r.content,
                  prompt,
                  ctx.modelRegistry,
                  config.filterModel,
                  complete
                );

                if (filterResult.filtered !== null) {
                  return `Source: ${r.url}\n\n${filterResult.filtered}`;
                }

                const reason = filterResult.reason.startsWith("No filter model available")
                  ? "No filter model available. Returning raw content."
                  : filterResult.reason;

                const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
                try {
                  const filePath = offloadToFile(fullText);
                  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
                  return [
                    `# ${r.title}`,
                    `Source: ${r.url}`,
                    `⚠ ${reason}`,
                    "",
                    `${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`,
                    "",
                    `Full content saved to ${filePath} (${fullText.length} chars). Use \`read\` to explore further.`,
                  ].join("\n");
                } catch {
                  return `⚠ Could not write temp file. Returning inline.\n\n${fullText}`;
                }
              })
            )
          );

          const successCount = results.filter((r) => !r.error).length;
          return {
            content: [{ type: "text", text: blocks.join("\n\n---\n\n") }],
            details: {
              responseId,
              successCount,
              totalCount: results.length,
              filtered: true,
            },
          };
        }

        // No prompt: file-first for each URL
        const successCount = results.filter((r) => !r.error).length;
        const lines: string[] = [];
        lines.push(`Fetched ${successCount}/${results.length} URLs.`);
        lines.push("");
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.error) {
            lines.push(`${i + 1}. ❌ ${r.url}: ${r.error}`);
          } else {
            const isGitHubCloneResult = githubCloneUrls.has(r.url);
            if (isGitHubCloneResult) {
              lines.push(`${i + 1}. ✅ ${r.title}`);
              lines.push(`   ${r.url}`);
              lines.push(`   ${r.content}`);
            } else {
              const fullText = `# ${r.title}\n\n${r.content}`;
              let filePath: string;
              try {
                filePath = offloadToFile(fullText);
              } catch {
                lines.push(`${i + 1}. ⚠ ${r.title}`);
                lines.push(`   ${r.url}`);
                lines.push("   ⚠ Could not write temp file. Returning inline.");
                const inlinePreview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
                lines.push(`   Preview: ${inlinePreview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
                lines.push("");
                continue;
              }
              const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
              lines.push(`${i + 1}. ✅ ${r.title}`);
              lines.push(`   ${r.url}`);
              lines.push(`   File: ${filePath} (${fullText.length} chars)`);
              lines.push(`   Preview: ${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
            }
          }
          lines.push("");
        }
        lines.push(`Use \`read\` on the file paths above to explore content. Use get_search_content with responseId "${responseId}" to retrieve from memory.`);
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
      if ((result as any).isError) {
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
  // Tool 3: code_search
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
        if ((result as any).isError) {
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

  // -------------------------------------------------------------------------
  // Tool 4: get_search_content
  // -------------------------------------------------------------------------
  if (registrationConfig.tools.get_search_content) {
    pi.registerTool({
    name: "get_search_content",
    label: "Get Content",
    description:
      "Retrieve full content from a previous web_search, code_search, or fetch_content result.",
    parameters: GetSearchContentParams,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { responseId, query, queryIndex, url, urlIndex, maxChars } = normalizeGetSearchContentInput(params);

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
            content: [{ type: "text", text: truncateContent(lines.join("\n"), maxChars) }],
            details: { type: "search", queryCount: stored.queries.length },
          };
        }

        let text = `## Query: ${targetQuery.query}\n\n`;
        if (targetQuery.error) {
          text += `Error: ${targetQuery.error}`;
        } else {
          text += targetQuery.answer;
        }
        text = truncateContent(text, maxChars);

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
            content: [{ type: "text", text: truncateContent(lines.join("\n"), maxChars) }],
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

        const text = truncateContent(`# ${targetContent.title}\n\n${targetContent.content}`, maxChars);
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
          content: [{ type: "text", text: truncateContent(ctx.content, maxChars) }],
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
      if ((result as any).isError) {
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
