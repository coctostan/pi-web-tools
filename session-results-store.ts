import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, statSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { StoredResultData } from "./storage.js";

export const DEFAULT_RESULTS_DIR = join(homedir(), ".pi", "cache", "web-tools");

export function resultsFilePath(sessionId: string, dir: string = DEFAULT_RESULTS_DIR): string {
  return join(dir, `results-${sessionId}.json`);
}

export function writeStoreSnapshot(filePath: string, entries: StoredResultData[]): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(tempPath, JSON.stringify(entries), "utf-8");
    renameSync(tempPath, filePath);
  } catch {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // ignore temp cleanup failures
    }
    // best-effort
  }
}

export function readStoreSnapshot(filePath: string): StoredResultData[] {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredResultData[];
    return [];
  } catch {
    return [];
  }
}

export function deleteStoreFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // best-effort
  }
}

export function pruneStaleStoreFiles(dir: string, maxAgeMs: number): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }

  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith("results-") || !name.endsWith(".json")) continue;
    const full = join(dir, name);
    try {
      const stat = statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        deleteStoreFile(full);
      }
    } catch {
      // ignore
    }
  }
}
