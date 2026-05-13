import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resultsFilePath,
  writeStoreSnapshot,
  readStoreSnapshot,
  deleteStoreFile,
} from "./session-results-store.js";
import type { StoredResultData } from "./storage.js";

describe("session-results-store (#032 AC-COMPACT-1)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "web-tools-results-test-"));
  });

  it("resultsFilePath returns a per-session-id path under the given root", () => {
    expect(resultsFilePath("abc123", dir)).toBe(join(dir, "results-abc123.json"));
  });

  it("writeStoreSnapshot persists an array of stored results that readStoreSnapshot can load", () => {
    const sessionId = "sess-1";
    const path = resultsFilePath(sessionId, dir);
    const entries: StoredResultData[] = [
      { id: "r1", type: "search", timestamp: Date.now(), queries: [{ query: "q", answer: "a", results: [], error: null }] },
    ];
    writeStoreSnapshot(path, entries);
    expect(existsSync(path)).toBe(true);
    const loaded = readStoreSnapshot(path);
    expect(loaded).toEqual(entries);
  });

  it("writeStoreSnapshot leaves no temporary snapshot files after a successful write", () => {
    const path = resultsFilePath("sess-atomic", dir);
    writeStoreSnapshot(path, []);
    expect(readdirSync(dir).filter((name) => name.includes(".tmp-"))).toEqual([]);
  });

  it("readStoreSnapshot returns empty array for missing file", () => {
    expect(readStoreSnapshot(resultsFilePath("nope", dir))).toEqual([]);
  });

  it("deleteStoreFile removes the file (best-effort, no throw on missing)", () => {
    const path = resultsFilePath("sess-2", dir);
    writeStoreSnapshot(path, []);
    expect(existsSync(path)).toBe(true);
    deleteStoreFile(path);
    expect(existsSync(path)).toBe(false);
    // Second delete must not throw.
    expect(() => deleteStoreFile(path)).not.toThrow();
  });
});

it("pruneStaleStoreFiles deletes files older than maxAgeMs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "web-tools-prune-"));
  const { writeStoreSnapshot, pruneStaleStoreFiles, resultsFilePath } = await import("./session-results-store.js");
  const oldPath = resultsFilePath("old", dir);
  const newPath = resultsFilePath("new", dir);
  writeStoreSnapshot(oldPath, []);
  writeStoreSnapshot(newPath, []);

  // Backdate the "old" file 2 days.
  const past = Date.now() / 1000 - 60 * 60 * 48;
  utimesSync(oldPath, past, past);

  pruneStaleStoreFiles(dir, 24 * 60 * 60 * 1000);

  const remaining = readdirSync(dir);
  expect(remaining).not.toContain("results-old.json");
  expect(remaining).toContain("results-new.json");

  rmSync(dir, { recursive: true, force: true });
});
