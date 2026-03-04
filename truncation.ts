export const DEFAULT_GET_CONTENT_MAX_CHARS = 30_000;
export const MAX_GET_CONTENT_CHARS = 100_000;

/**
 * Truncate content to a character limit with an informative message.
 * Used by get_search_content to enforce size guardrails.
 */
export function truncateContent(content: string, maxChars?: number): string {
  const limit = maxChars !== undefined
    ? Math.min(Math.max(1, maxChars), MAX_GET_CONTENT_CHARS)
    : DEFAULT_GET_CONTENT_MAX_CHARS;

  if (content.length <= limit) {
    return content;
  }

  const truncated = content.slice(0, limit);
  return `${truncated}\n\n[Content truncated at ${limit} chars. Total: ${content.length} chars. Use a higher maxChars to retrieve more.]`;
}
