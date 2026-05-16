import type { ExtensionAPI, ExtensionContext, SessionShutdownEvent, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { complete } from "@earendil-works/pi-ai";
import pLimit from "p-limit";
import { searchExa, findSimilarExa, formatSearchResults } from "./exa-search.js";
import { enhanceQuery, postProcessResults, type EnhancedQuery } from "./smart-search.js";
import { extractContent, fetchAllContent, clearUrlCache } from "./extract.js";
import { extractGitHub, clearCloneCache, parseGitHubUrl } from "./github-extract.js";
import { getConfig, resetConfigCache } from "./config.js";
import { searchContext } from "./exa-context.js";
import { filterContent, getFilterModelKeys } from "./filter.js";
import { getCached, getCachedForModels, putCache, getCacheStats, clearCache, purgeExpired, resetCounters } from "./research-cache.js";
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
  restoreFromSessionFile,
  type StoredResultData,
  type QueryResultData,
  type ExtractedContent,
  type ContextResultData,
} from "./storage.js";
import { writeStoreSnapshot, readStoreSnapshot, pruneStaleStoreFiles, resultsFilePath, DEFAULT_RESULTS_DIR } from "./session-results-store.js";

const MAX_INLINE_CONTENT = 30000;

import { join } from "node:path";
import { homedir } from "node:os";
const DEFAULT_CACHE_FILE = join(homedir(), ".pi", "cache", "web-tools", "research-cache.json");


// ---------------------------------------------------------------------------
// Session event handlers
// ---------------------------------------------------------------------------

function snapshotStore(ctx: ExtensionContext): void {
  const sessionId = ctx?.sessionManager?.getSessionId?.();
  if (!sessionId) return;
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  writeStoreSnapshot(resultsFilePath(sessionId, dir), getAllResults());
}

function isRestorableStoredResult(entry: StoredResultData): boolean {
  return !!(entry?.id && entry.type && (!entry.timestamp || Date.now() - entry.timestamp <= 60 * 60 * 1000) &&
    (entry.type !== "search" || Array.isArray(entry.queries)) && (entry.type !== "fetch" || Array.isArray(entry.urls)) &&
    (entry.type !== "context" || (entry.context && typeof entry.context.query === "string")));
}

function rehydrateFromDisk(ctx: ExtensionContext): boolean {
  const sessionId = ctx?.sessionManager?.getSessionId?.();
  if (!sessionId) return false;
  const dir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  const entries = readStoreSnapshot(resultsFilePath(sessionId, dir));
  if (entries.length === 0) return false;
  clearResults();
  let restored = 0;
  for (const entry of entries) if (isRestorableStoredResult(entry)) { storeResult(entry.id, entry); restored++; }
  return restored > 0;
}

function handleSessionStart(event: SessionStartEvent, ctx: ExtensionContext): void {
  resetCounters();
  const initialDir = (ctx as any).webToolsResultsDir ?? DEFAULT_RESULTS_DIR;
  pruneStaleStoreFiles(initialDir, 24 * 60 * 60 * 1000);
  switch (event.reason) {
    case "startup":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      if (!rehydrateFromDisk(ctx)) restoreFromSession(ctx);
      return;
    case "reload":
      clearCloneCache();
      if (!rehydrateFromDisk(ctx)) restoreFromSession(ctx);
      return;
    case "new":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      clearResults();
      return;
    case "resume":
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      if (!rehydrateFromDisk(ctx)) restoreFromSession(ctx);
      return;
    case "fork": {
      clearCloneCache();
      clearUrlCache();
      cleanupTempFiles();
      const restoredFromDisk = rehydrateFromDisk(ctx);
      if (!restoredFromDisk) {
        if (event.previousSessionFile) {
          restoreFromSessionFile(event.previousSessionFile);
        } else {
          restoreFromSession(ctx);
        }
      }
      return;
  }
}
}

function handleSessionShutdown(_event?: SessionShutdownEvent, _ctx?: ExtensionContext): void {
  clearCloneCache();
  clearResults();
  resetConfigCache();
  cleanupTempFiles();
}

// ---------------------------------------------------------------------------
// Tool parameter schemas
// ---------------------------------------------------------------------------

const WebSearchParams = Type.Object({ query: Type.Optional(Type.String({ description: "Search query" })), queries: Type.Optional(Type.Array(Type.String(), { description: "Batch search queries" })), numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Results per query" })), type: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("instant"), Type.Literal("deep")], { description: "Search type" })), category: Type.Optional(Type.Union([Type.Literal("company"), Type.Literal("research paper"), Type.Literal("news"), Type.Literal("tweet"), Type.Literal("people"), Type.Literal("personal site"), Type.Literal("financial report"), Type.Literal("pdf")], { description: "Content category" })), includeDomains: Type.Optional(Type.Array(Type.String(), { description: "Domains to include" })), excludeDomains: Type.Optional(Type.Array(Type.String(), { description: "Domains to exclude" })), detail: Type.Optional(Type.Union([Type.Literal("summary"), Type.Literal("highlights")], { description: "Result detail level" })), freshness: Type.Optional(Type.Union([Type.Literal("realtime"), Type.Literal("day"), Type.Literal("week"), Type.Literal("any")], { description: 'Content freshness; "realtime" means last 1 hour' })), similarUrl: Type.Optional(Type.String({ description: "Find similar pages" })) });
const FetchContentParams = Type.Object({ url: Type.Optional(Type.String({ description: "URL to fetch" })), urls: Type.Optional(Type.Array(Type.String(), { description: "URLs to fetch" })), forceClone: Type.Optional(Type.Boolean({ description: "Force GitHub repository cloning" })), prompt: Type.Optional(Type.String({ description: "Focused extraction prompt" })), noCache: Type.Optional(Type.Boolean({ description: "Bypass cached prompt results" })) });
const GetSearchContentParams = Type.Object({ responseId: Type.String({ description: "Stored result ID" }), query: Type.Optional(Type.String({ description: "Query to retrieve" })), queryIndex: Type.Optional(Type.Number({ description: "Query index" })), url: Type.Optional(Type.String({ description: "URL to retrieve" })), urlIndex: Type.Optional(Type.Number({ description: "URL index" })), maxChars: Type.Optional(Type.Number({ description: "Maximum characters to return" })) });
const CodeSearchParams = Type.Object({ query: Type.String({ description: "Code example request" }), tokensNum: Type.Optional(Type.Number({ description: "Response token budget" })) });

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Session event handlers
  pi.on("session_start", async (event, ctx) => {
    handleSessionStart(event, ctx);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    handleSessionShutdown(event, ctx);
  });


  pi.on("session_before_compact", async (_event, ctx) => {
    snapshotStore(ctx);
  });

  pi.on("session_compact", async (_event, ctx) => {
    rehydrateFromDisk(ctx);
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
  if (typeof (pi as any).registerCommand === "function") (pi as any).registerCommand("web-tools", { description: "Inspect and manage the pi-web-tools research cache and session results.", getArgumentCompletions: (prefix: string) => { const items = ["stats", "clear-cache", "purge-expired", "recent", "help"].filter((n) => n.startsWith(prefix)).map((n) => ({ value: n, label: n })); return items.length > 0 ? items : null; }, handler: async (args: string, ctx: any) => { const trimmed = (args ?? "").trim(); const [sub, ...rest] = trimmed.split(/\s+/); const { dispatch } = await import("./commands.js"); await dispatch(sub ?? "", rest.join(" "), { getCacheStats: () => getCacheStats(DEFAULT_CACHE_FILE, getConfig().cacheTTLMinutes), clearCache: () => clearCache(DEFAULT_CACHE_FILE), purgeExpired: () => purgeExpired(DEFAULT_CACHE_FILE), resetCounters: () => resetCounters(), listResults: () => getAllResults(), confirm: (title: string, message: string) => ctx.ui.confirm(title, message), notify: (msg: string, type?: "info" | "warning" | "error") => ctx.ui.notify(msg, type ?? "info"), now: () => Date.now() }); } });

  // -------------------------------------------------------------------------
  // Tool 1: web_search
  // -------------------------------------------------------------------------
  if (registrationConfig.tools.web_search) {
    pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web and return summarized source results.",
    parameters: WebSearchParams,
    prepareArguments: (raw) => normalizeWebSearchInput(raw as any) as any,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { queries: queryList, numResults, type, category, includeDomains, excludeDomains, detail, freshness, similarUrl } = params as any;

      const config = getConfig();
        const results: QueryResultData[] = [];
        let successfulQueries = 0;
        let totalResults = 0;
        if (similarUrl) {
          // findSimilar mode — single request, no pLimit loop
          const unsupportedFilters: string[] = [];
          if (freshness !== undefined && freshness !== "any") unsupportedFilters.push("freshness");
          if (category !== undefined) unsupportedFilters.push("category");
          const warningNote =
            unsupportedFilters.length > 0
              ? `Note: ${unsupportedFilters.join(", ")} filter${unsupportedFilters.length > 1 ? "s are" : " is"} not supported for similarUrl searches and was ignored.\n\n`
              : "";
          try {
            const searchResults = await findSimilarExa(similarUrl, {
              apiKey: config.exaApiKey,
              numResults,
              signal,
              detail,
              includeDomains,
              excludeDomains,
            });
            const formatted = formatSearchResults(searchResults);
            successfulQueries++;
            totalResults += searchResults.length;
            results.push({
              query: similarUrl,
              answer: warningNote + formatted,
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
          const resultPromises = queryList.map((q: string) =>
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
                  numResults,
                  type: enhanced.typeOverride ?? type,
                  category,
                  includeDomains,
                  excludeDomains,
                  signal,
                  detail,
                  freshness,
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
        snapshotStore(ctx);

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
            ptcValue: {
              responseId: searchId,
              queries: results.map(r => ({
                query: r.query,
                results: r.results,
                error: r.error,
              })),
              queryCount: similarUrl ? 1 : queryList.length,
              successfulQueries,
              totalResults,
            },
          },
        };
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
    description: "Fetch readable content from URL(s); use prompt for focused extraction.",
    parameters: FetchContentParams,
    prepareArguments: (raw) => normalizeFetchContentInput(raw as any) as any,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { urls: dedupedUrls, forceClone, prompt, noCache } = params as any;


      const githubCloneUrls = new Set<string>();

      const fetchOne = async (targetUrl: string): Promise<ExtractedContent> => {
        try {
          // Check if it's a GitHub URL
          const ghInfo = parseGitHubUrl(targetUrl);
          if (ghInfo) {
            const ghResult = await extractGitHub(targetUrl, signal, forceClone);
            if (ghResult) {
              githubCloneUrls.add(ghResult.url);
              return ghResult;
            }
            // Fall through to normal extraction if GitHub extraction returns null
          }
          return await extractContent(targetUrl, signal);
        } catch (err) {
          if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          return { url: targetUrl, title: targetUrl, content: "", error: msg };
        }
      };

        if (dedupedUrls.length === 1 && prompt && !noCache) {
          const config = getConfig();
          if (config.filterModel) {
            const cachedAnswer = getCachedForModels(dedupedUrls[0], prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
            if (cachedAnswer !== null) {
              const responseId = generateId();
              return {
                content: [{ type: "text", text: `Source: ${dedupedUrls[0]}\n\n${cachedAnswer}` }],
                details: {
                  responseId,
                  url: dedupedUrls[0],
                  charCount: cachedAnswer.length,
                  filtered: true,
                  cached: true, filterModel: config.filterModel,
                  ptcValue: { responseId, urls: [{ url: dedupedUrls[0], title: null, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null }], successCount: 1, totalCount: 1 },
                },
              };
            }
          }
        }
        let results: ExtractedContent[];
        if (dedupedUrls.length === 1) {
          results = [await fetchOne(dedupedUrls[0])];
        } else {
          const limit = pLimit(3);
          results = await Promise.all(dedupedUrls.map((url: string) => limit(() => fetchOne(url))));
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
        snapshotStore(ctx);

        // Single URL: return content directly (possibly truncated)
        if (results.length === 1) {
          const r = results[0];
          if (r.error) {
            return {
              content: [{ type: "text", text: `Error fetching ${r.url}: ${r.error}` }],
              details: { responseId, url: r.url, error: r.error, ptcValue: { responseId, urls: [{ url: r.url, title: null, content: null, filtered: null, filePath: null, charCount: null, error: r.error }], successCount: 0, totalCount: 1 } },
            };
          }

          if (prompt) {
            const config = getConfig();
          const filterResult = await filterContent(
            r.content,
            prompt,
            ctx.modelRegistry,
            config.filterModel,
            complete,
            signal,
          );

            if (filterResult.filtered !== null) {
              // Store in cache
              putCache(r.url, prompt, filterResult.model, filterResult.filtered, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
              return {
                content: [{ type: "text", text: `Source: ${r.url}\n\n${filterResult.filtered}` }],
                details: {
                  responseId,
                  url: r.url,
                  title: r.title,
                  charCount: filterResult.filtered.length,
                  filtered: true,
                  filterModel: filterResult.model,
                  ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: null, filtered: filterResult.filtered, filePath: null, charCount: filterResult.filtered.length, error: null }], successCount: 1, totalCount: 1 },
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
                  ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: r.content, filtered: null, filePath, charCount: r.content.length, error: null }], successCount: 1, totalCount: 1 },
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
                  ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: r.content, filtered: null, filePath: null, charCount: r.content.length, error: null }], successCount: 1, totalCount: 1 },
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
                ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: r.content, filtered: null, filePath: null, charCount: r.content.length, error: null }], successCount: 1, totalCount: 1 },
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
                ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: r.content, filtered: null, filePath: null, charCount: r.content.length, error: null }], successCount: 1, totalCount: 1 },
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
              ptcValue: { responseId, urls: [{ url: r.url, title: r.title, content: null, filtered: null, filePath, charCount: r.content.length, error: null }], successCount: 1, totalCount: 1 },
            },
          };
        }

        // Multiple URLs
        if (prompt) {
          const config = getConfig();
          const limit = pLimit(3);
          const ptcSources: Array<Record<string, unknown>> = [];
          const blocks = await Promise.all(
            results.map((r) =>
              limit(async () => {
                if (r.error) {
                  ptcSources.push({ url: r.url, error: r.error });
                  return `❌ ${r.url}: ${r.error}`;
                }

                // Check cache first (unless noCache) when the effective model is configured.
                if (!noCache && config.filterModel) {
                  const cachedAnswer = getCachedForModels(r.url, prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
                  if (cachedAnswer !== null) {
                    ptcSources.push({ url: r.url, answer: cachedAnswer, contentLength: cachedAnswer.length });
                    return `Source: ${r.url}\n\n${cachedAnswer}`;
                  }
                }
              const filterResult = await filterContent(
                r.content,
                prompt,
                ctx.modelRegistry,
                config.filterModel,
                complete,
                signal,
              );
                if (filterResult.filtered !== null) {
                  // Store in cache
                  putCache(r.url, prompt, filterResult.model, filterResult.filtered, config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
                  ptcSources.push({ url: r.url, answer: filterResult.filtered, contentLength: filterResult.filtered.length });
                  return `Source: ${r.url}\n\n${filterResult.filtered}`;
                }
                const reason = filterResult.reason.startsWith("No filter model available")
                  ? "No filter model available. Returning raw content."
                  : filterResult.reason;

                const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
                try {
                  const filePath = offloadToFile(fullText);
                  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
                  ptcSources.push({ url: r.url, title: r.title, content: r.content, filePath, contentLength: r.content.length });
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
                  ptcSources.push({ url: r.url, title: r.title, content: r.content, filePath: null, contentLength: r.content.length });
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
              ptcValue: { responseId, prompt, sources: ptcSources, successCount, totalCount: results.length },
            },
          };
        }

        // No prompt: file-first for each URL
        const successCount = results.filter((r) => !r.error).length;
        const lines: string[] = [];
        const ptcUrls: Array<{ url: string, title: string | null, content: string | null, filtered: string | null, filePath: string | null, charCount: number | null, error: string | null }> = [];
        lines.push(`Fetched ${successCount}/${results.length} URLs.`);
        lines.push("");
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.error) {
            lines.push(`${i + 1}. ❌ ${r.url}: ${r.error}`);
            ptcUrls.push({ url: r.url, title: null, content: null, filtered: null, filePath: null, charCount: null, error: r.error });
          } else {
            const isGitHubCloneResult = githubCloneUrls.has(r.url);
            if (isGitHubCloneResult) {
              lines.push(`${i + 1}. ✅ ${r.title}`);
              lines.push(`   ${r.url}`);
              lines.push(`   ${r.content}`);
              ptcUrls.push({ url: r.url, title: r.title, content: r.content, filtered: null, filePath: null, charCount: r.content.length, error: null });
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
                ptcUrls.push({ url: r.url, title: r.title, content: r.content, filtered: null, filePath: null, charCount: r.content.length, error: null });
                continue;
              }
              const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
              lines.push(`${i + 1}. ✅ ${r.title}`);
              lines.push(`   ${r.url}`);
              lines.push(`   File: ${filePath} (${fullText.length} chars)`);
              lines.push(`   Preview: ${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
              ptcUrls.push({ url: r.url, title: r.title, content: null, filtered: null, filePath, charCount: r.content.length, error: null });
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
            ptcValue: { responseId, urls: ptcUrls, successCount, totalCount: results.length },
          },
        };
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
      description: "Search for working code examples from GitHub, docs, and Stack Overflow.",
      parameters: CodeSearchParams,
      prepareArguments: (raw) => normalizeCodeSearchInput(raw as any) as any,

      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const { query, tokensNum } = params as any;

        const config = getConfig();

        try {
          const result = await searchContext(query, {
            apiKey: config.exaApiKey,
            tokensNum,
            signal,
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
          snapshotStore(ctx);

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
              ptcValue: {
                responseId,
                query: result.query,
                content: result.content,
                charCount: result.content.length,
                truncated,
              },
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: `Error: ${msg}` }],
            isError: true,
            details: { query, error: msg, ptcValue: { query, error: msg } },
          };
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
    description: "Retrieve stored full content from a previous search or fetch result.",
    parameters: GetSearchContentParams,
    prepareArguments: (raw) => normalizeGetSearchContentInput(raw as any) as any,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      if (signal?.aborted) {
        return {
          content: [{ type: "text" as const, text: "Operation aborted." }],
          details: {},
          isError: true,
        };
      }
      const { responseId, query, queryIndex, url, urlIndex, maxChars } = params as any;

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
            details: { type: "search", queryCount: stored.queries.length, ptcValue: { type: "search", queries: stored.queries.map(q => ({ query: q.query, results: q.results, error: q.error })) } },
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
            ptcValue: { type: "search", query: targetQuery.query, results: targetQuery.results, error: targetQuery.error },
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
            details: { type: "fetch", urlCount: stored.urls.length, ptcValue: { type: "fetch", urls: stored.urls.map(u => ({ url: u.url, title: u.title || null, charCount: u.error ? null : u.content.length, error: u.error || null })) } },
          };
        }

        if (targetContent.error) {
          return {
            content: [
              { type: "text", text: `Error: ${targetContent.error}` },
            ],
            details: { type: "fetch", url: targetContent.url, error: targetContent.error, ptcValue: { type: "fetch", url: targetContent.url, error: targetContent.error } },
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
            ptcValue: { type: "fetch", url: targetContent.url, title: targetContent.title, content: targetContent.content, charCount: targetContent.content.length },
          },
        };
      }

      // Handle context results
      if (stored.type === "context" && stored.context) {
        const ctx = stored.context;
        if (ctx.error) {
          return {
            content: [{ type: "text", text: `Error: ${ctx.error}` }],
            details: { type: "context", query: ctx.query, error: ctx.error, ptcValue: { type: "context", query: ctx.query, error: ctx.error } },
          };
        }

        return {
          content: [{ type: "text", text: truncateContent(ctx.content, maxChars) }],
          details: {
            type: "context",
            query: ctx.query,
            charCount: ctx.content.length,
            ptcValue: { type: "context", query: ctx.query, content: ctx.content, charCount: ctx.content.length },
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
