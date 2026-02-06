import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import pLimit from "p-limit";
import type { ExtractedContent } from "./storage.js";

export type { ExtractedContent };

const NON_RECOVERABLE_ERRORS = ["Unsupported content type", "Response too large"];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function extractHeadingTitle(text: string): string | null {
  const match = text.match(/^#{1,2}\s+(.+)/m);
  return match ? match[1].trim() : null;
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    const last = path.split("/").pop();
    if (last) return decodeURIComponent(last).replace(/[-_]/g, " ");
    return parsed.hostname;
  } catch {
    return url;
  }
}

function isHtml(contentType: string): boolean {
  return contentType.includes("text/html") || contentType.includes("application/xhtml");
}

function isBinaryType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith("image/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("video/") ||
    ct.includes("application/zip") ||
    ct.includes("application/octet-stream")
  );
}

function makeErrorResult(url: string, error: string): ExtractedContent {
  return { url, title: "", content: "", error };
}

async function extractViaHttp(
  url: string,
  signal?: AbortSignal
): Promise<ExtractedContent> {
  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
    : AbortSignal.timeout(30000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: combinedSignal,
    });
  } catch (err: unknown) {
    if (signal?.aborted) return makeErrorResult(url, "Aborted");
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Fetch failed: ${msg}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
  }

  const contentType = response.headers.get("content-type") || "";

  if (isBinaryType(contentType)) {
    return makeErrorResult(url, "Unsupported content type");
  }

  // Size guard via content-length header
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
    return makeErrorResult(url, "Response too large");
  }

  const text = await response.text();

  if (text.length > MAX_SIZE) {
    return makeErrorResult(url, "Response too large");
  }

  // Non-HTML: return raw text
  if (!isHtml(contentType)) {
    const title = extractHeadingTitle(text) || titleFromUrl(url);
    return { url, title, content: text, error: null };
  }

  // HTML: parse with linkedom + Readability
  const { document } = parseHTML(text);
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  if (!article || !article.content) {
    return makeErrorResult(url, "Could not extract readable content");
  }

  // Convert HTML to markdown
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  const markdown = turndown.turndown(article.content).trim();

  if (markdown.length < 500) {
    return {
      url,
      title: article.title || titleFromUrl(url),
      content: markdown,
      error: "Extracted content appears incomplete",
    };
  }

  return {
    url,
    title: article.title || titleFromUrl(url),
    content: markdown,
    error: null,
  };
}

async function extractViaJina(
  url: string,
  signal?: AbortSignal
): Promise<ExtractedContent | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const combinedSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000);

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: "text/markdown",
        "X-No-Cache": "true",
      },
      signal: combinedSignal,
    });

    if (!response.ok) return null;

    const text = await response.text();

    // Find "Markdown Content:" marker
    const marker = "Markdown Content:";
    const idx = text.indexOf(marker);
    const content = idx >= 0 ? text.slice(idx + marker.length).trim() : text.trim();

    if (content.length < 100) return null;
    if (content.startsWith("Loading...") || content.startsWith("Please enable JavaScript")) {
      return null;
    }

    const title = extractHeadingTitle(content) || titleFromUrl(url);
    return { url, title, content, error: null };
  } catch {
    return null;
  }
}

export async function extractContent(
  url: string,
  signal?: AbortSignal
): Promise<ExtractedContent> {
  // Check abort first
  if (signal?.aborted) {
    return makeErrorResult(url, "Aborted");
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return makeErrorResult(url, "Invalid URL");
  }

  let httpResult: ExtractedContent;
  let httpError: string | null = null;

  try {
    httpResult = await extractViaHttp(url, signal);
    // If no error, return directly
    if (!httpResult.error) return httpResult;
    // If non-recoverable, return directly
    if (NON_RECOVERABLE_ERRORS.includes(httpResult.error)) return httpResult;
    // Recoverable error — try Jina
    httpError = httpResult.error;
  } catch (err: unknown) {
    httpError = err instanceof Error ? err.message : String(err);
  }

  // Try Jina fallback
  const jinaResult = await extractViaJina(url, signal);
  if (jinaResult) return jinaResult;

  // Jina also failed — return original error with helpful message
  const errorMsg = httpError
    ? `${httpError}. Jina Reader fallback also failed.`
    : "Failed to extract content";
  return makeErrorResult(url, errorMsg);
}

export async function fetchAllContent(
  urls: string[],
  signal?: AbortSignal
): Promise<ExtractedContent[]> {
  const limit = pLimit(3);
  const tasks = urls.map((url) => limit(() => extractContent(url, signal)));
  return Promise.all(tasks);
}
