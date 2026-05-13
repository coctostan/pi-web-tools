import { readFileSync, existsSync } from "node:fs";

export interface ExtractedContent {
  url: string;
  title: string;
  content: string;
  error: string | null;
}

export interface QueryResultData {
  query: string;
  answer: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  error: string | null;
}

export interface ContextResultData {
  query: string;
  content: string;
  error: string | null;
}

export interface StoredResultData {
  id: string;
  type: "search" | "fetch" | "context";
  timestamp: number;
  queries?: QueryResultData[];
  urls?: ExtractedContent[];
  context?: ContextResultData;
}

interface ExtensionContext {
  sessionManager: {
    getEntries(): Array<{
      type: string;
      customType?: string;
      data?: unknown;
      timestamp?: string;
    }>;
  };
}

const MAX_ENTRIES = 50;
const ONE_HOUR_MS = 60 * 60 * 1000;

function loadSessionEntriesFromFile(filePath: string): Array<{ type: string; customType?: string; data?: unknown }> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  const entries: Array<{ type: string; customType?: string; data?: unknown; id?: unknown }> = [];

  for (const line of content.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines, matching Pi's session reader behavior.
    }
  }

  const header = entries[0];
  if (entries.length > 0 && (header?.type !== "session" || typeof header.id !== "string")) return [];
  return entries;
}

const store = new Map<string, StoredResultData>();

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function storeResult(id: string, data: StoredResultData): void {
  // Delete first so re-insert goes to end
  store.delete(id);
  store.set(id, data);

  // Evict oldest entries if over capacity
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function getResult(id: string): StoredResultData | null {
  const data = store.get(id);
  if (data === undefined) return null;

  // Refresh LRU position: delete + re-insert
  store.delete(id);
  store.set(id, data);
  return data;
}

export function getAllResults(): StoredResultData[] {
  return Array.from(store.values());
}

export function deleteResult(id: string): boolean {
  return store.delete(id);
}

export function clearResults(): void {
  store.clear();
}

export function restoreFromSession(ctx: ExtensionContext): void {
  const now = Date.now();
  const entries = ctx.sessionManager.getEntries();

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== "web-tools-results") continue;

    const data = entry.data as StoredResultData | undefined;
    if (!data || !data.id || !data.type) continue;
    if (data.type === "search" && !Array.isArray(data.queries)) continue;
    if (data.type === "fetch" && !Array.isArray(data.urls)) continue;
    if (data.type === "context" && (!data.context || typeof data.context.query !== "string")) continue;

    // Skip entries older than 1 hour
    if (data.timestamp && now - data.timestamp > ONE_HOUR_MS) continue;

    store.set(data.id, data);
  }

  // Enforce max capacity after restore
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}


export function restoreFromSessionFile(sessionFilePath: string): void {
  const now = Date.now();
  let entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
  try {
    entries = loadSessionEntriesFromFile(sessionFilePath);
  } catch {
    return; // missing file or parse error: leave store as-is
  }

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== "web-tools-results") continue;
    const data = entry.data as StoredResultData | undefined;
    if (!data || !data.id || !data.type) continue;
    if (data.type === "search" && !Array.isArray(data.queries)) continue;
    if (data.type === "fetch" && !Array.isArray(data.urls)) continue;
    if (data.type === "context" && (!data.context || typeof data.context.query !== "string")) continue;
    if (data.timestamp && now - data.timestamp > ONE_HOUR_MS) continue;
    store.set(data.id, data);
  }

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
