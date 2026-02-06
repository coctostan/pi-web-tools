import { describe, it, expect, beforeEach } from "vitest";
import {
  generateId,
  storeResult,
  getResult,
  getAllResults,
  deleteResult,
  clearResults,
  StoredResultData,
} from "./storage.js";

describe("storage", () => {
  beforeEach(() => {
    clearResults();
  });

  it("generateId returns unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it("store and retrieve a result", () => {
    const data: StoredResultData = {
      id: "test-1",
      type: "search",
      timestamp: Date.now(),
      queries: [{ query: "hello", answer: "world", results: [], error: null }],
    };
    storeResult("test-1", data);
    const result = getResult("test-1");
    expect(result).toEqual(data);
  });

  it("returns null for missing result", () => {
    expect(getResult("nonexistent")).toBeNull();
  });

  it("getAllResults returns all stored", () => {
    for (let i = 0; i < 5; i++) {
      const data: StoredResultData = {
        id: `item-${i}`,
        type: "fetch",
        timestamp: Date.now(),
        urls: [{ url: `https://example.com/${i}`, title: `Page ${i}`, content: "body", error: null }],
      };
      storeResult(`item-${i}`, data);
    }
    const all = getAllResults();
    expect(all).toHaveLength(5);
    expect(all.map((r) => r.id)).toEqual(["item-0", "item-1", "item-2", "item-3", "item-4"]);
  });

  it("deleteResult removes entry and returns true/false", () => {
    const data: StoredResultData = {
      id: "del-1",
      type: "search",
      timestamp: Date.now(),
    };
    storeResult("del-1", data);
    expect(deleteResult("del-1")).toBe(true);
    expect(getResult("del-1")).toBeNull();
    expect(deleteResult("del-1")).toBe(false);
  });

  it("evicts oldest when max capacity (50) reached", () => {
    for (let i = 0; i < 55; i++) {
      const data: StoredResultData = {
        id: `item-${i}`,
        type: "search",
        timestamp: Date.now(),
      };
      storeResult(`item-${i}`, data);
    }
    // First 5 should be evicted
    for (let i = 0; i < 5; i++) {
      expect(getResult(`item-${i}`)).toBeNull();
    }
    // Remaining 50 should exist
    for (let i = 5; i < 55; i++) {
      expect(getResult(`item-${i}`)).not.toBeNull();
    }
    expect(getAllResults()).toHaveLength(50);
  });

  it("accessing a result refreshes LRU position", () => {
    // Fill to capacity
    for (let i = 0; i < 50; i++) {
      const data: StoredResultData = {
        id: `item-${i}`,
        type: "search",
        timestamp: Date.now(),
      };
      storeResult(`item-${i}`, data);
    }
    // Access item-0, moving it to end (most recent)
    getResult("item-0");

    // Add a new item — should evict item-1 (now the oldest), not item-0
    storeResult("new-item", {
      id: "new-item",
      type: "search",
      timestamp: Date.now(),
    });

    expect(getResult("item-0")).not.toBeNull();
    expect(getResult("item-1")).toBeNull();
    expect(getAllResults()).toHaveLength(50);
  });
});
