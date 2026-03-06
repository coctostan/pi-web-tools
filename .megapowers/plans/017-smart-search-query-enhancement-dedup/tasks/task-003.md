---
id: 3
title: Add result dedup and snippet cleanup post-processing
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - smart-search.ts
  - smart-search.test.ts
files_to_create: []
---

### Task 3: Add result dedup and snippet cleanup post-processing [depends: 2]

**Files:**
- Modify: `smart-search.ts`
- Test: `smart-search.test.ts`

**Step 1 — Write the failing test**
First, at the top of `smart-search.test.ts`, change the import lines from:

```ts
import { describe, expect, it } from "vitest";
import { enhanceQuery } from "./smart-search.js";
```

to:

```ts
import { describe, expect, it } from "vitest";
import type { ExaSearchResult } from "./exa-search.js";
import { enhanceQuery, postProcessResults } from "./smart-search.js";
```

Then, below the closing `});` of the `describe("enhanceQuery", ...)` block, append this test block:

```ts
describe("postProcessResults", () => {
  it("removes later duplicate results while preserving the first ranked result", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Official Docs",
        url: "https://example.com/docs/getting-started?utm_source=google",
        snippet: "Primary result",
      },
      {
        title: "Official Docs Duplicate",
        url: "https://example.com/docs/getting-started?utm_medium=cpc",
        snippet: "Duplicate result",
      },
    ];

    const result = postProcessResults(input);

    expect(result.duplicatesRemoved).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Official Docs");
    expect(result.results[0].url).toContain("utm_source=google");
  });
  it("removes high-confidence breadcrumb and last-updated snippet noise", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Docs",
        url: "https://example.com/docs/api",
        snippet: "Docs > API > fetch_content Last updated Jan 15, 2026. Returns the fetched page.",
      },
    ];

    const result = postProcessResults(input);
    expect(result.results[0].snippet).toBe("Returns the fetched page.");
  });
  it("keeps malformed URLs and normal snippets instead of failing the whole batch", () => {
    const input: ExaSearchResult[] = [
      {
        title: "Broken URL",
        url: "not a valid url",
        snippet: "Normal snippet text.",
      },
      {
        title: "Canonical",
        url: "https://example.com/reference",
        snippet: "Reference docs.",
      },
      {
        title: "Canonical Duplicate",
        url: "https://example.com/reference?utm_campaign=spring",
        snippet: "Reference docs duplicate.",
      },
    ];

    const result = postProcessResults(input);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].url).toBe("not a valid url");
    expect(result.results[0].snippet).toBe("Normal snippet text.");
    expect(result.results[1].title).toBe("Canonical");
    expect(result.duplicatesRemoved).toBe(1);
  });
  it("skips malformed result entries and continues processing later results", () => {
    const input = [
      {
        title: "Broken entry",
        url: 42 as any,
        snippet: undefined as any,
      },
      {
        title: "Canonical",
        url: "https://example.com/reference",
        snippet: "Reference docs.",
      },
      {
        title: "Canonical Duplicate",
        url: "https://example.com/reference?utm_campaign=spring",
        snippet: "Reference docs duplicate.",
      },
    ] as unknown as ExaSearchResult[];

    const result = postProcessResults(input);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      title: "Broken entry",
      url: "",
      snippet: "",
    });
    expect(result.results[1].title).toBe("Canonical");
    expect(result.duplicatesRemoved).toBe(1);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run smart-search.test.ts -t "postProcessResults"`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'replace')`

**Step 3 — Write minimal implementation**
In `smart-search.ts`, append these types and functions below `enhanceQuery`:

```ts
export interface PostProcessedResults<T extends { url: string; snippet: string }> {
  results: T[];
  duplicatesRemoved: number;
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

function normalizeUrlForDedup(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        parsed.searchParams.delete(key);
      }
    }

    const pathname = parsed.pathname !== "/" && parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;

    const search = parsed.searchParams.toString();
    return `${parsed.origin}${pathname}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

function cleanSnippet(snippet: string): string {
  let cleaned = snippet;

  cleaned = cleaned.replace(/^\s*(?:[^>\n]+\s>\s){2,}[^.]*\.?\s*/i, "");
  cleaned = cleaned.replace(/\bLast updated\s+[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\.?\s*/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || snippet;
}

export function postProcessResults<T extends { url: string; snippet: string }>(results: T[]): PostProcessedResults<T> {
  const seen = new Set<string>();
  const kept: T[] = [];
  let duplicatesRemoved = 0;

  for (const result of results) {
    const safeUrl = typeof (result as any).url === "string" ? (result as any).url : "";
    const safeSnippet = typeof (result as any).snippet === "string" ? (result as any).snippet : "";
    const cleaned = {
      ...result,
      url: safeUrl,
      snippet: cleanSnippet(safeSnippet),
    } as T;

    const normalized = safeUrl ? normalizeUrlForDedup(safeUrl) : null;
    if (normalized === null) {
      kept.push(cleaned);
      continue;
    }
    if (seen.has(normalized)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(normalized);
    kept.push(cleaned);
  }

  return { results: kept, duplicatesRemoved };
}
```

No test file changes needed in this step — the imports were already updated in Step 1.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run smart-search.test.ts -t "postProcessResults"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
