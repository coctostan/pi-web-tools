---
id: 2
title: Add rule-based query enhancement helpers
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - smart-search.ts
  - smart-search.test.ts
---

### Task 2: Add rule-based query enhancement helpers

**Files:**
- Create: `smart-search.ts`
- Test: `smart-search.test.ts`

**Step 1 — Write the failing test**
Create `smart-search.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import { enhanceQuery } from "./smart-search.js";

describe("enhanceQuery", () => {
  it("marks error-like queries for keyword search without changing the query text", () => {
    const original = "TypeError: Cannot read properties of undefined (reading 'map')";
    const result = enhanceQuery(original);

    expect(result.originalQuery).toBe(original);
    expect(result.finalQuery).toBe(original);
    expect(result.queryChanged).toBe(false);
    expect(result.typeOverride).toBe("keyword");
    expect(result.appliedRules).toContain("error-like");
  });

  it("preserves an explicit version string when expanding a vague coding query", () => {
    const result = enhanceQuery("react v19.2 hooks");

    expect(result.finalQuery).toBe("react v19.2 hooks docs example");
    expect(result.finalQuery).toContain("v19.2");
  });

  it("does not invent a version string when the query has no explicit version", () => {
    const result = enhanceQuery("vite config");

    expect(result.finalQuery).not.toMatch(/\bv?\d+(?:\.\d+){0,2}\b/);
  });

  it("expands a vague 1-3 word coding query", () => {
    const result = enhanceQuery("vite config");

    expect(result.queryChanged).toBe(true);
    expect(result.finalQuery).toBe("vite config docs example");
    expect(result.appliedRules).toContain("vague-coding-query");
  });

  it("does not expand a query that is already specific", () => {
    const original = "how to configure vite alias in tsconfig";
    const result = enhanceQuery(original);

    expect(result.queryChanged).toBe(false);
    expect(result.finalQuery).toBe(original);
    expect(result.appliedRules).toEqual([]);
  });

  it("does not expand a short query that is not coding related", () => {
    const original = "weather today";
    const result = enhanceQuery(original);

    expect(result.queryChanged).toBe(false);
    expect(result.finalQuery).toBe(original);
    expect(result.appliedRules).toEqual([]);
  });

  it("does not force keyword search for generic title-cased queries that merely mention Error", () => {
    const original = "React Error Boundary docs";
    const result = enhanceQuery(original);

    expect(result.typeOverride).toBeUndefined();
    expect(result.finalQuery).toBe(original);
    expect(result.queryChanged).toBe(false);
    expect(result.appliedRules).toEqual([]);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run smart-search.test.ts`
Expected: FAIL — `Failed to resolve import "./smart-search.js" from "smart-search.test.ts"`

**Step 3 — Write minimal implementation**
Create `smart-search.ts` with this content:

```ts
export interface EnhancedQuery {
  originalQuery: string;
  finalQuery: string;
  queryChanged: boolean;
  typeOverride?: "keyword";
  appliedRules: string[];
}

const CODING_TERMS = new Set([
  "react",
  "vite",
  "vitest",
  "typescript",
  "javascript",
  "node",
  "npm",
  "pnpm",
  "yarn",
  "next",
  "nextjs",
  "tailwind",
  "eslint",
  "jest",
  "webpack",
  "tsconfig",
  "docker",
  "kubernetes",
  "python",
  "django",
  "flask",
  "rust",
  "cargo",
  "go",
  "java",
]);

function words(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

function looksErrorLike(query: string): boolean {
  return /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError)\s*:/i.test(query)
    || /Cannot\s+read\s+properties/i.test(query)
    || /\b[a-zA-Z_$][\w$]*\s+is\s+not\s+(?:defined|a function)\b/i.test(query)
    || /^\s*at\s+\S.+$/m.test(query);
}

function looksCodingQuery(query: string): boolean {
  const tokens = words(query).map((token) => token.toLowerCase());
  return tokens.some((token) => CODING_TERMS.has(token));
}

function isVagueCodingQuery(query: string): boolean {
  const count = words(query).length;
  return count >= 1 && count <= 3 && looksCodingQuery(query);
}

function expandQuery(query: string): string {
  return `${query.trim()} docs example`;
}

export function enhanceQuery(query: string): EnhancedQuery {
  const originalQuery = query;

  if (looksErrorLike(query)) {
    return {
      originalQuery,
      finalQuery: originalQuery,
      queryChanged: false,
      typeOverride: "keyword",
      appliedRules: ["error-like"],
    };
  }

  if (isVagueCodingQuery(query)) {
    const finalQuery = expandQuery(query);
    return {
      originalQuery,
      finalQuery,
      queryChanged: finalQuery !== originalQuery,
      appliedRules: ["vague-coding-query"],
    };
  }

  return {
    originalQuery,
    finalQuery: originalQuery,
    queryChanged: false,
    appliedRules: [],
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run smart-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
