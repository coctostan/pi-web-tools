import type { CacheStats } from "./research-cache.js";
import type { StoredResultData } from "./storage.js";

export interface PurgeExpiredResult {
  removed: number;
  remaining: number;
  saved: boolean;
}

export interface DispatchDeps {
  getCacheStats: () => CacheStats;
  clearCache: () => boolean | void;
  purgeExpired: () => PurgeExpiredResult | void;
  resetCounters: () => void;
  listResults: () => StoredResultData[];
  confirm: (title: string, message: string) => Promise<boolean>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  now: () => number;
}

const SUBCOMMANDS = ["stats", "clear-cache", "purge-expired", "recent", "help"] as const;

function helpText(): string {
  return [
    "/web-tools subcommands:",
    "  stats          Show cache entry count, hits, misses, age, size, TTL",
    "  clear-cache    Remove all entries from the persistent research cache",
    "  purge-expired  Remove only entries past their TTL",
    "  recent         List recent session results (search/fetch/context)",
    "  help           Show this help",
  ].join("\n");
}


function formatTs(ts: number | null): string {
  return ts === null ? "—" : new Date(ts).toISOString();
}

function statsText(s: CacheStats): string {
  return [
    "Cache stats:",
    `  entries:     ${s.entries}`,
    `  hits:        ${s.hits}`,
    `  misses:      ${s.misses}`,
    `  oldest:      ${formatTs(s.oldest)}`,
    `  newest:      ${formatTs(s.newest)}`,
    `  sizeBytes:   ${s.sizeBytes}`,
    `  ttlMinutes:  ${s.ttlMinutes}`,
  ].join("\n");
}


function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function labelFor(entry: StoredResultData): { label: string; chars: number } {
  if (entry.type === "search" && entry.queries) {
    const qs = entry.queries.map((q) => q.query).join(", ");
    const chars = entry.queries.reduce((n, q) => n + (q.answer?.length ?? 0), 0);
    return { label: qs, chars };
  }
  if (entry.type === "fetch" && entry.urls && entry.urls.length > 0) {
    const first = entry.urls[0];
    const chars = entry.urls.reduce((n, u) => n + (u.content?.length ?? 0), 0);
    return { label: first.url, chars };
  }
  if (entry.type === "context" && entry.context) {
    return { label: entry.context.query, chars: entry.context.content?.length ?? 0 };
  }
  return { label: entry.id, chars: 0 };
}

function recentText(entries: StoredResultData[], now: number): string {
  if (entries.length === 0) return "No recent results in this session.";
  const MAX_LINES = 18;
  const lines: string[] = ["Recent session results:"];
  const slice = entries.slice(-MAX_LINES);
  for (const e of slice) {
    const { label, chars } = labelFor(e);
    const age = formatAge(Math.max(0, now - (e.timestamp ?? now)));
    const short = label.length > 60 ? label.slice(0, 57) + "…" : label;
    lines.push(`  [${e.type}] ${short} • ${age} • ${chars} chars`);
  }
  return lines.join("\n");
}

export async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void> {
  const sub = subcommand.trim();
  if (sub === "" || sub === "help") {
    deps.notify(helpText(), "info");
    return;
  }
  if (sub === "stats") {
    const stats = deps.getCacheStats();
    if (stats.ok === false) {
      deps.notify("Failed to read cache stats: cache file is unreadable or corrupt.", "error");
      return;
    }
    deps.notify(statsText(stats), "info");
    return;
  }
  if (sub === "clear-cache") {
    const ok = await deps.confirm("Clear research cache?", "This removes all cached web-tools answers from disk.");
    if (!ok) {
      deps.notify("Clear cache cancelled.", "info");
      return;
    }
    const cleared = deps.clearCache();
    if (cleared === false) {
      deps.notify("Failed to clear research cache.", "error");
      return;
    }
    deps.resetCounters();
    deps.notify("Research cache cleared.", "info");
    return;
  }
  if (sub === "purge-expired") {
    const result = deps.purgeExpired();
    if (result?.saved === false) {
      deps.notify("Failed to purge expired cache entries.", "error");
      return;
    }
    const count = result ? ` (${result.removed} removed, ${result.remaining} remaining)` : "";
    deps.notify(`Expired cache entries purged${count}.`, "info");
    return;
  }
  if (sub === "recent") {
    deps.notify(recentText(deps.listResults(), deps.now()), "info");
    return;
  }
  deps.notify(`Unknown subcommand: "${sub}". Try /web-tools help.\n\n${helpText()}`, "warning");
}

export const __test = { SUBCOMMANDS, helpText };
