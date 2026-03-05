# Plan

### Task 1: searchExa sends summary contents when detail is "summary"

### Task 1: searchExa sends summary contents when detail is "summary"

**AC covered:** AC 1
**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`
**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("searchExa", ...)` block:

```typescript
it("sends contents.summary when detail is 'summary'", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test query", { apiKey: "key", detail: "summary" });
  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.contents).toEqual({ summary: true });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-search.test.ts -t "sends contents.summary when detail is 'summary'"`

Expected: FAIL — `expected { highlights: { numSentences: 3, highlightsPerUrl: 3 } } to deeply equal { summary: true }`

**Step 3 — Write minimal implementation**

In `exa-search.ts`:

1. Add `detail` to `ExaSearchOptions`:

```typescript
export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  type?: "auto" | "instant" | "deep";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
  detail?: "summary" | "highlights";
}
```

2. In `searchExa()`, change request `contents` from:

```typescript
contents: { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
```

to:

```typescript
contents: options.detail === "summary"
  ? { summary: true }
  : { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "sends contents.summary when detail is 'summary'"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.

### Task 2: searchExa sends highlights contents when detail is "highlights" [no-test] [depends: 1]

### Task 2: searchExa sends highlights contents when detail is "highlights" [no-test] [depends: 1]

**AC covered:** AC 2 (owned by Task 3’s updated highlights-mode test)

**Justification:** Redundant coverage. Task 3 already updates the existing test (`"uses highlights content mode with numSentences 3 and highlightsPerUrl 3"`) to pass `detail: "highlights"`, which directly locks AC2.
**Files:**
- None

**Step 1 — Verify existing coverage passes**

Run: `npx vitest run exa-search.test.ts -t "uses highlights content mode with numSentences 3 and highlightsPerUrl 3"`

Expected: PASS.

### Task 3: searchExa defaults to summary mode when detail is omitted [depends: 1]

### Task 3: searchExa defaults to summary mode when detail is omitted [depends: 1]

**AC covered:** AC 2, AC 3

**Files:**
- Modify: `exa-search.ts`
- Modify: `exa-search.test.ts`

**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("searchExa", ...)` block:

```typescript
it("defaults to summary mode when detail is omitted", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test query", { apiKey: "key" });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.contents).toEqual({ summary: true });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-search.test.ts -t "defaults to summary mode when detail is omitted"`

Expected: FAIL — `expected { highlights: { numSentences: 3, highlightsPerUrl: 3 } } to deeply equal { summary: true }` — because after Task 1, the default (no `detail`) still sends highlights.

**Step 3 — Write minimal implementation**

In `exa-search.ts`, change the `contents` ternary in `searchExa()` from:

```typescript
contents: options.detail === "summary"
  ? { summary: true }
  : { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
```

to:

```typescript
contents: options.detail === "highlights"
  ? { highlights: { numSentences: 3, highlightsPerUrl: 3 } }
  : { summary: true },
```

Now the default (no `detail` or `detail: "summary"`) sends `{ summary: true }`.

Also update the existing test `"uses highlights content mode with numSentences 3 and highlightsPerUrl 3"` to pass `detail: "highlights"`:

Find this test:
```typescript
it("uses highlights content mode with numSentences 3 and highlightsPerUrl 3", async () => {
```

Change the `searchExa` call from:
```typescript
await searchExa("test", { apiKey: "key" });
```
to:
```typescript
await searchExa("test", { apiKey: "key", detail: "highlights" });
```

Also update the existing test `"sends correct request to Exa API"` — its assertion `expect(body.contents).toEqual({ highlights: { ... } })` needs to change to `expect(body.contents).toEqual({ summary: true })` since it calls without `detail`:

Find:
```typescript
expect(body.contents).toEqual({ highlights: { numSentences: 3, highlightsPerUrl: 3 } });
```
Replace with:
```typescript
expect(body.contents).toEqual({ summary: true });
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "defaults to summary mode when detail is omitted"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.

### Task 4: parseExaResults maps summary field to snippet

### Task 4: parseExaResults maps summary field to snippet

**AC covered:** AC 4, AC 5, AC 7
**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`
**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("searchExa", ...)` block (we test through `searchExa` since `parseExaResults` is not exported):

```typescript
it("maps snippet fallback order summary -> highlights -> text -> empty string", async () => {
  // summary case
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Summary Result",
          url: "https://example.com/summary",
          summary: "A concise one-line summary of the page.",
        },
      ],
    }),
  });
  let results = await searchExa("test", { apiKey: "key" });
  expect(results).toHaveLength(1);
  expect(results[0].snippet).toBe("A concise one-line summary of the page.");
  // highlights fallback case
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Highlights Result",
          url: "https://example.com/highlights",
          highlights: ["Sentence one.", "Sentence two."],
        },
      ],
    }),
  });
  results = await searchExa("test", { apiKey: "key", detail: "highlights" });
  expect(results[0].snippet).toBe("Sentence one. Sentence two.");

  // text fallback case
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Text Result",
          url: "https://example.com/text",
          text: "Raw text fallback",
        },
      ],
    }),
  });
  results = await searchExa("test", { apiKey: "key" });
  expect(results[0].snippet).toBe("Raw text fallback");

  // empty fallback case (title + url only)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Bare Result",
          url: "https://example.com/bare",
        },
      ],
    }),
  });
  results = await searchExa("test", { apiKey: "key" });
  expect(results[0].snippet).toBe("");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-search.test.ts -t "maps snippet fallback order summary -> highlights -> text -> empty string"`

Expected: FAIL — `expected '' to be 'A concise one-line summary of the page.'` because `parseExaResults` currently ignores `summary`.

**Step 3 — Write minimal implementation**

In `exa-search.ts`:

1. Add `summary` to `ExaRawResult`:

```typescript
type ExaRawResult = {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  highlights?: unknown;
  summary?: unknown;
  publishedDate?: unknown;
};
```

2. In `parseExaResults`, update snippet fallback order to:

```typescript
snippet: (() => {
  if (typeof r.summary === "string" && r.summary) return r.summary;
  if (Array.isArray(r.highlights)) {
    const joined = r.highlights.filter((h): h is string => typeof h === "string").join(" ");
    if (joined) return joined;
  }
  if (typeof r.text === "string") return r.text;
  return "";
})(),
```

This explicitly locks compatibility fallback as `summary -> highlights -> text -> ""` (AC5 and AC7 included here).

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "maps snippet fallback order summary -> highlights -> text -> empty string"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing. Fallback compatibility remains covered here; Tasks 5 and 6 are verification-only.

### Task 5: parseExaResults still maps highlights to snippet when summary is absent [no-test] [depends: 4]

### Task 5: parseExaResults still maps highlights to snippet when summary is absent [no-test] [depends: 4]

**AC covered:** AC 5 (owned by Task 4 fallback-order test)

**Justification:** Redundant compatibility coverage now lives in Task 4, which asserts parser fallback order `summary -> highlights -> text -> ""`.
**Files:**
- None

**Step 1 — Verify compatibility coverage**

Run: `npx vitest run exa-search.test.ts -t "parses highlights response into snippet"`

Expected: PASS.

### Task 6: parseExaResults produces empty snippet when no summary and no highlights [no-test] [depends: 4]

### Task 6: parseExaResults produces empty snippet when no summary and no highlights [no-test] [depends: 4]

**AC covered:** AC 7 (owned by Task 4 fallback-order test)

**Justification:** Redundant fallback coverage now lives in Task 4’s single parser-order test, including the title/url-only case with `expect(results[0].snippet).toBe("");`.
**Files:**
- None

**Step 1 — Verify empty-snippet fallback coverage**

Run: `npx vitest run exa-search.test.ts -t "maps snippet fallback order summary -> highlights -> text -> empty string"`

Expected: PASS.

### Task 7: formatSearchResults does not truncate summary snippets

### Task 7: formatSearchResults does not truncate summary snippets

**AC covered:** AC 6
**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`
**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("formatSearchResults", ...)` block:

```typescript
it("does not truncate summary snippet even when over 200 chars", () => {
  const summary = "S".repeat(260);
  const results: ExaSearchResult[] = [
    { title: "Summary Page", url: "https://example.com/page", snippet: summary },
  ];

  const output = formatSearchResults(results);
  expect(output).toContain(summary);
  expect(output).not.toContain("…");
  });
```

**Step 2 — Run test, verify it fails**

  Run: `npx vitest run exa-search.test.ts -t "does not truncate summary snippet even when over 200 chars"`

Expected: FAIL — `expected '...'(formatted output) not to contain '…'`

**Step 3 — Write minimal implementation**

In `exa-search.ts`, inside `formatSearchResults`, replace:

```typescript
const preview = r.snippet.length > 200 ? r.snippet.slice(0, 200) + "…" : r.snippet;
parts.push(`   ${preview}`);
```

with:

```typescript
parts.push(`   ${r.snippet}`);
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "does not truncate summary snippet even when over 200 chars"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.

### Task 8: web_search tool schema includes detail parameter and passes it to searchExa [depends: 1, 3]

### Task 8: web_search tool schema includes detail parameter and passes it to searchExa [depends: 1, 3]
**AC covered:** AC 8, AC 9
**Files:**
- Modify: `index.ts`
- Modify: `tool-params.ts`
- Test: `index.test.ts`
**Step 1 — Write failing tests**

In `index.test.ts`, switch config mocking to a single hoisted mutable state (no `vi.doMock`) and add schema + pass-through tests.

1) Replace the current top-level config mock with:

```typescript
const configState = vi.hoisted(() => ({
  value: {
    exaApiKey: null,
    filterModel: undefined,
    github: {
      maxRepoSizeMB: 350,
      cloneTimeoutSeconds: 30,
      clonePath: "/tmp/pi-github-repos",
    },
    tools: {
      web_search: false,
      fetch_content: true,
      code_search: false,
      get_search_content: false,
    },
  },
}));
vi.mock("./config.js", () => ({
  getConfig: () => configState.value,
  resetConfigCache: vi.fn(),
}));
```

2) Add exa mocks + helper:

```typescript
const exaState = vi.hoisted(() => ({
  searchExa: vi.fn(),
  formatSearchResults: vi.fn(),
}));
vi.mock("./exa-search.js", () => ({
  searchExa: exaState.searchExa,
  formatSearchResults: exaState.formatSearchResults,
}));
async function getWebSearchTool() {
  vi.resetModules();
  const previousTools = { ...configState.value.tools };
  configState.value.tools = {
    web_search: true,
    fetch_content: false,
    code_search: false,
    get_search_content: false,
  };
  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => tools.set(def.name, def)),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  configState.value.tools = previousTools;
  const webSearchTool = tools.get("web_search");
  if (!webSearchTool) throw new Error("web_search tool was not registered");
  return { webSearchTool };
}
```

3) Add tests:

```typescript
it("web_search schema exposes detail enum summary|highlights", async () => {
  const { webSearchTool } = await getWebSearchTool();
  const detailSchema = webSearchTool.parameters.properties.detail;
  expect(detailSchema).toBeDefined();
  expect(detailSchema.anyOf.map((v: any) => v.const)).toEqual(["summary", "highlights"]);
});
it("web_search execute passes normalized detail to searchExa", async () => {
  exaState.searchExa.mockResolvedValueOnce([
    { title: "Result", url: "https://example.com", snippet: "summary" },
  ]);
  exaState.formatSearchResults.mockReturnValue(
    "1. **Result**\n   https://example.com\n   summary"
  );

  const { webSearchTool } = await getWebSearchTool();
  await webSearchTool.execute("call-web", { query: "x", detail: "highlights" });
  expect(exaState.searchExa).toHaveBeenCalledWith(
    "x",
    expect.objectContaining({ detail: "highlights" })
  );
});
```

**Step 2 — Run tests, verify they fail**

Run:
- `npx vitest run index.test.ts -t "web_search schema exposes detail enum summary|highlights"`
  - Expected: FAIL — `expected undefined to be defined`
- `npx vitest run index.test.ts -t "web_search execute passes normalized detail to searchExa"`
  - Expected: FAIL — expected call containing `detail: "highlights"`, but received options have no `detail`

**Step 3 — Write minimal implementation**

1. In `tool-params.ts`, extend `normalizeWebSearchInput`:

```typescript
const VALID_DETAIL_VALUES = new Set(["summary", "highlights"]);
export function normalizeWebSearchInput(params: {
  query?: unknown;
  queries?: unknown;
  numResults?: unknown;
  type?: unknown;
  category?: unknown;
  includeDomains?: unknown;
  excludeDomains?: unknown;
  detail?: unknown;
}) {
  // existing parsing...
  const detail = typeof params.detail === "string" && VALID_DETAIL_VALUES.has(params.detail)
    ? (params.detail as "summary" | "highlights")
  : undefined;
  return {
    queries: queryList,
    numResults,
    type,
    category,
    includeDomains,
    excludeDomains,
    detail,
  };
}
```

2. In `index.ts`, add `detail` to `WebSearchParams`:

```typescript
detail: Type.Optional(Type.Union([
  Type.Literal("summary"),
  Type.Literal("highlights"),
], { description: 'Detail level: "summary" (default) or "highlights"' })),
```

3. In `index.ts`, pass `detail` through to `searchExa`:

```typescript
const { queries: queryList, numResults, type, category, includeDomains, excludeDomains, detail } = normalizeWebSearchInput(params);
const searchResults = await searchExa(q, {
  apiKey: config.exaApiKey,
  numResults: numResults !== undefined ? Math.max(1, Math.min(numResults, 20)) : 5,
  type,
  category,
  includeDomains,
  excludeDomains,
  signal: combinedSignal,
  detail,
});
```

**Step 4 — Run tests, verify they pass**

Run the same two commands from Step 2.

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.

### Task 9: Update web_search tool description to mention summary default [no-test] [depends: 8]

### Task 9: Update web_search tool description to mention summary default [no-test] [depends: 8]

**AC covered:** AC 10

**Justification:** Tool description text change only — no observable behavior to test.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

In `index.ts`, update the `web_search` tool's `description` field (around line 171):

From:
```typescript
description:
  "Search the web for pages matching a query. Returns highlights (short relevant excerpts), not full page content. Use `fetch_content` to read a page in full. Supports batch searching with multiple queries.",
```

To:
```typescript
description:
  "Search the web for pages matching a query. Returns summaries by default (~1 line per result). Use `detail: \"highlights\"` for longer excerpts. Use `fetch_content` to read a page in full. Supports batch searching with multiple queries.",
```

**Step 2 — Verify**

Run: `npx vitest run`

Expected: All tests passing — no behavioral change.

### Task 10: Add FILE_FIRST_PREVIEW_SIZE constant to offload.ts

### Task 10: Add FILE_FIRST_PREVIEW_SIZE constant to offload.ts

**AC covered:** AC 16

**Files:**
- Modify: `offload.ts`
- Test: `offload.test.ts`

**Step 1 — Write the failing test**

Add to `offload.test.ts`, at the bottom of the file (inside the `describe("offload", ...)` block), update the existing "exports expected constants" test and add a new one:

```typescript
it("exports FILE_FIRST_PREVIEW_SIZE as 500", () => {
  expect(FILE_FIRST_PREVIEW_SIZE).toBe(500);
});
```

Also update the import at the top of `offload.test.ts` to include `FILE_FIRST_PREVIEW_SIZE`:

```typescript
import {
  shouldOffload,
  offloadToFile,
  buildOffloadResult,
  cleanupTempFiles,
  FILE_OFFLOAD_THRESHOLD,
  PREVIEW_SIZE,
  FILE_FIRST_PREVIEW_SIZE,
} from "./offload.js";
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run offload.test.ts -t "exports FILE_FIRST_PREVIEW_SIZE as 500"`

Expected: FAIL — `SyntaxError: The requested module './offload.js' does not provide an export named 'FILE_FIRST_PREVIEW_SIZE'`

**Step 3 — Write minimal implementation**

In `offload.ts`, add after the existing `PREVIEW_SIZE` constant (line 7):

```typescript
export const FILE_FIRST_PREVIEW_SIZE = 500;
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run offload.test.ts -t "exports FILE_FIRST_PREVIEW_SIZE as 500"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.

### Task 11: fetch_content single URL without prompt writes to temp file and returns preview + path [depends: 10]

### Task 11: fetch_content single URL without prompt writes to temp file and returns preview + path [depends: 10]

**AC covered:** AC 11, AC 17 (raw path no longer uses MAX_INLINE_CONTENT)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Add a new `describe` block in `index.test.ts`. First update the mocks at the top — add `offloadToFile` mock in the hoisted state and mock offload module:

```typescript
const offloadState = vi.hoisted(() => ({
  offloadToFile: vi.fn(),
}));

vi.mock("./offload.js", () => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: offloadState.offloadToFile,
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
  FILE_FIRST_PREVIEW_SIZE: 500,
}));
```

Then add the test:

```typescript
describe("fetch_content file-first storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.extractContent.mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "A".repeat(2000),
      error: null,
    });
    offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-abc123.txt");
  });

  it("writes raw single-URL fetch to temp file and returns 500-char preview + path", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    const ctx = {
      modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
    } as any;

    const result = await fetchContentTool.execute(
      "call-file-first",
      { url: "https://example.com/page" },
      undefined,
      undefined,
      ctx
    );

    // offloadToFile should have been called with the full text
    expect(offloadState.offloadToFile).toHaveBeenCalledOnce();
    const writtenContent = offloadState.offloadToFile.mock.calls[0][0];
    expect(writtenContent).toContain("Example Page");
    expect(writtenContent).toContain("A".repeat(2000));

    const text = getText(result);
    // Should contain a 500-char preview
    expect(text.length).toBeLessThan(2000);
    expect(text).toContain("/tmp/pi-web-abc123.txt");
    expect(text).toContain("Example Page");
    expect(text).toContain("https://example.com/page");
    // Should NOT contain the full 2000-char content inline
    expect(text).not.toContain("A".repeat(2000));
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "writes raw single-URL fetch to temp file"`

Expected: FAIL — `expected offloadToFile to have been called once` — because the current code inlines content up to `MAX_INLINE_CONTENT` (30K) and never calls `offloadToFile` for content under that threshold.

**Step 3 — Write minimal implementation**

In `index.ts`, import `FILE_FIRST_PREVIEW_SIZE` from offload:

Change the import line (line 19):
```typescript
import { shouldOffload, offloadToFile, buildOffloadResult, cleanupTempFiles, FILE_FIRST_PREVIEW_SIZE } from "./offload.js";
```

Replace the single-URL no-prompt path (the block starting at line 426 `let text = \`# ${r.title}\n\n${r.content}\`;` through line 444) with:

```typescript
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
            },
          };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "writes raw single-URL fetch to temp file"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: The existing test `"keeps no-prompt raw behavior"` (in the prompt wiring test) will need updating since it now expects file-first output instead of inline `"# Docs\n\nRAW PAGE"`. Update that assertion in the same task:

In the existing test `"uses filterContent in prompt mode..."`, change the final assertion from:
```typescript
expect(getText(rawResult)).toBe("# Docs\n\nRAW PAGE");
```
to:
```typescript
expect(getText(rawResult)).toContain("Docs");
expect(getText(rawResult)).toContain("Full content saved to");
expect(offloadState.offloadToFile).toHaveBeenCalled();
```

### Task 12: fetch_content prompt fallback writes to temp file instead of inlining [depends: 10, 11]

### Task 12: fetch_content prompt fallback writes to temp file instead of inlining [depends: 10, 11]

**AC covered:** AC 14, AC 17
**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Add to `describe("fetch_content file-first storage", ...)` in `index.test.ts`:

```typescript
it("writes single-url prompt fallback content to temp file (no MAX_INLINE path)", async () => {
  state.extractContent.mockResolvedValue({
    url: "https://example.com/page",
    title: "Example Page",
    content: "X".repeat(2000),
    error: null,
  });

  state.filterContent.mockReset();
  state.filterContent.mockResolvedValueOnce({
    filtered: null,
    reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)",
  });

  offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-single-fallback.txt");

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

  const result = await fetchContentTool.execute(
    "call-single-fallback",
    { url: "https://example.com/page", prompt: "What matters?" },
    undefined,
    undefined,
    ctx
  );

  expect(offloadState.offloadToFile).toHaveBeenCalledTimes(1);
  const text = getText(result);
  expect(text).toContain("Source: https://example.com/page");
  expect(text).toContain("/tmp/pi-web-single-fallback.txt");
  expect(text).toContain("Full content saved to");
  expect(text).not.toContain("Content truncated");
  expect(text).not.toContain("MAX_INLINE_CONTENT");
});
```

Also update existing prompt-mode expectations to align with file-first fallback:

1) In test `"uses filterContent in prompt mode, remaps no-model warning, preserves model-error warning, and keeps no-prompt raw behavior"`, replace:

```typescript
expect(getText(noModelFallback)).toBe(
  "⚠ No filter model available. Returning raw content.\n\n# Docs\n\nRAW PAGE"
);
```

with:

```typescript
expect(getText(noModelFallback)).toContain("No filter model available");
expect(getText(noModelFallback)).toContain("Full content saved to");
expect(offloadState.offloadToFile).toHaveBeenCalled();
```

2) In test `"uses p-limit(3) and returns filtered + fallback blocks for multi-url prompt mode"`, replace inline fallback expectation:

```typescript
expect(text).toContain(
  "⚠ No filter model available. Returning raw content.\n\n# B Docs\n\nRAW B"
);
```

with file-first expectation:

```typescript
expect(text).toContain("# B Docs");
expect(text).toContain("Full content saved to");
expect(offloadState.offloadToFile).toHaveBeenCalled();
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "writes single-url prompt fallback content to temp file (no MAX_INLINE path)"`

Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times` because single-URL prompt fallback still returns inline truncated content.

**Step 3 — Write minimal implementation**

In `index.ts`, update **both** prompt fallback branches inside `fetch_content`:

1) Replace the single-URL prompt fallback block:

```typescript
let text = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
let truncated = false;

if (text.length > MAX_INLINE_CONTENT) {
  text = text.slice(0, MAX_INLINE_CONTENT);
  text += `\n\n[Content truncated at ${MAX_INLINE_CONTENT} chars. Use get_search_content with responseId "${responseId}" to retrieve full content.]`;
  truncated = true;
}

return {
  content: [{ type: "text", text }],
  details: {
    responseId,
    url: r.url,
    title: r.title,
    charCount: r.content.length,
    truncated,
    filtered: false,
  },
};
```

with file-first logic:

```typescript
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
    },
  };
}
```

2) Replace the multi-URL prompt fallback block:

```typescript
let fallbackText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
if (fallbackText.length > MAX_INLINE_CONTENT) {
  fallbackText = fallbackText.slice(0, MAX_INLINE_CONTENT);
  fallbackText += `\n\n[Content truncated. Use get_search_content with responseId "${responseId}" and url "${r.url}" for full content.]`;
}
return fallbackText;
```

with:

```typescript
const fullText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
try {
  const filePath = offloadToFile(fullText);
  const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
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
  return `⚠ Could not write temp file. Returning inline.\n\n${fullText}`;
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "writes single-url prompt fallback content to temp file (no MAX_INLINE path)"`

Expected: PASS.

**Step 5 — Verify no regressions**

Run:
- `npx vitest run`
- `grep -n "MAX_INLINE_CONTENT" index.ts`

Expected:
- Vitest: all tests passing.
- Grep: no `MAX_INLINE_CONTENT` usage in any `fetch_content` raw/fallback branches (single raw, multi raw, single prompt fallback, multi prompt fallback); remaining usage only in non-fetch paths (e.g., `code_search`).

### Task 13: fetch_content multi-URL without prompt writes each to its own temp file [depends: 10, 11]

### Task 13: fetch_content multi-URL without prompt writes each to its own temp file [depends: 10, 11]

**AC covered:** AC 12

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Add to the `"fetch_content file-first storage"` describe block in `index.test.ts`:

```typescript
it("writes each multi-URL raw fetch to its own temp file", async () => {
  state.extractContent.mockImplementation(async (url: string) => {
    if (url === "https://a.example/page") {
      return { url, title: "Page A", content: "Content A " + "x".repeat(1000), error: null };
    }
    return { url, title: "Page B", content: "Content B " + "y".repeat(1000), error: null };
  });

  let callCount = 0;
  offloadState.offloadToFile.mockImplementation(() => {
    callCount++;
    return `/tmp/pi-web-file${callCount}.txt`;
  });

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = {
    modelRegistry: { find: vi.fn(), getApiKey: vi.fn() },
  } as any;

  const result = await fetchContentTool.execute(
    "call-multi-file",
    { urls: ["https://a.example/page", "https://b.example/page"] },
    undefined,
    undefined,
    ctx
  );

  expect(offloadState.offloadToFile).toHaveBeenCalledTimes(2);

  const text = getText(result);
  expect(text).toContain("Page A");
  expect(text).toContain("Page B");
  expect(text).toContain("/tmp/pi-web-file1.txt");
  expect(text).toContain("/tmp/pi-web-file2.txt");
  expect(text).toContain("https://a.example/page");
  expect(text).toContain("https://b.example/page");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "writes each multi-URL raw fetch to its own temp file"`

Expected: FAIL — `expected offloadToFile to have been called 2 times` — because the current multi-URL no-prompt path returns a summary listing without writing files.

**Step 3 — Write minimal implementation**

In `index.ts`, replace the multi-URL no-prompt block (starting at line ~496 `// No prompt: existing summary behavior`) with:

```typescript
        // No prompt: file-first for each URL
        const successCount = results.filter((r) => !r.error).length;
        const lines: string[] = [];
        lines.push(`Fetched ${successCount}/${results.length} URLs.`);
        lines.push("");
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.error) {
            lines.push(`${i + 1}. ❌ ${r.url}: ${r.error}`);
          } else {
            const fullText = `# ${r.title}\n\n${r.content}`;
            let filePath: string;
            try {
              filePath = offloadToFile(fullText);
            } catch {
              lines.push(`${i + 1}. ⚠ ${r.title} — could not write temp file`);
              lines.push(`   ${r.url}`);
              continue;
            }
            const preview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
            lines.push(`${i + 1}. ✅ ${r.title}`);
            lines.push(`   ${r.url}`);
            lines.push(`   File: ${filePath} (${fullText.length} chars)`);
            lines.push(`   Preview: ${preview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
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
          },
        };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "writes each multi-URL raw fetch to its own temp file"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: The existing test `"keeps existing multi-url summary behavior when prompt is omitted"` needs updating since the output format changed. Update its assertions from:
```typescript
expect(text).toContain("Fetched 2/3 URLs. Response ID:");
expect(text).toContain("1. ✅ A Docs (5 chars)");
expect(text).toContain("2. ✅ B Docs (5 chars)");
expect(text).toContain("3. ❌ https://c.example/docs: timeout");
expect(text).toContain("Use get_search_content with responseId");
```
to:
```typescript
expect(text).toContain("Fetched 2/3 URLs.");
expect(text).toContain("A Docs");
expect(text).toContain("B Docs");
expect(text).toContain("❌ https://c.example/docs: timeout");
expect(offloadState.offloadToFile).toHaveBeenCalledTimes(2);
```

All tests passing.

### Task 14: fetch_content with prompt and successful filter returns inline without writing file [no-test] [depends: 11]

### Task 14: fetch_content with prompt and successful filter returns inline without writing file [no-test] [depends: 11]

**AC covered:** AC 13
**Why no test in this task:** This is a verification-only lock task. The executable test coverage already exists in `index.test.ts` (`"uses filterContent in prompt mode, remaps no-model warning, preserves model-error warning, and keeps no-prompt raw behavior"`) and this task verifies that behavior remains intact without adding a second overlapping test.

**Files:**
- Verify: `index.test.ts`

**Verification steps**

1) Verify the no-file-write assertion exists in the prompt-success test:

```bash
grep -n "expect(offloadState.offloadToFile).not.toHaveBeenCalled()" index.test.ts
```

Expected output includes the exact assertion line.

2) Verify the inline filtered response assertion exists:

```bash
grep -n "Source: https://example.com/docs\\n\\n100 requests/minute\." index.test.ts
```

Expected output includes the prompt-success inline response expectation.

3) Run the focused prompt wiring test:

```bash
npx vitest run index.test.ts -t "uses filterContent in prompt mode"
```

Expected: PASS.

4) Run full test suite:

```bash
npx vitest run
```

Expected: all tests passing.

### Task 15: GitHub clone results are returned inline without file-first [depends: 11, 13]

### Task 15: GitHub clone results are returned inline without file-first [depends: 11, 13]

**AC covered:** AC 15
**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`
**Step 1 — Write failing tests**

In `index.test.ts`, ensure GitHub helpers are mocked:

```typescript
const ghState = vi.hoisted(() => ({
  parseGitHubUrl: vi.fn(),
  extractGitHub: vi.fn(),
  clearCloneCache: vi.fn(),
}));
vi.mock("./github-extract.js", () => ({
  parseGitHubUrl: ghState.parseGitHubUrl,
  extractGitHub: ghState.extractGitHub,
  clearCloneCache: ghState.clearCloneCache,
}));
```

Then add to `describe("fetch_content file-first storage", ...)`:

```typescript
it("keeps single-url GitHub clone result inline (no file-first)", async () => {
  ghState.parseGitHubUrl.mockReturnValue({ owner: "test", repo: "repo", type: "root", refIsFullSha: false });
  ghState.extractGitHub.mockResolvedValue({
    url: "https://github.com/test/repo",
    title: "test/repo",
    content: "├── src/\n└── package.json",
    error: null,
  });

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
  const result = await fetchContentTool.execute(
    "call-gh-single",
    { url: "https://github.com/test/repo" },
    undefined,
    undefined,
    ctx
  );

  expect(offloadState.offloadToFile).not.toHaveBeenCalled();
  const text = getText(result);
  expect(text).toContain("├── src/");
  expect(text).not.toContain("Full content saved to");
});

it("only successful GitHub clone URLs stay inline in mixed multi-url raw fetches", async () => {
  ghState.parseGitHubUrl.mockImplementation((url: string) =>
    url.startsWith("https://github.com/test/repo")
      ? { owner: "test", repo: "repo", type: "root", refIsFullSha: false }
      : null
  );

  ghState.extractGitHub
    .mockResolvedValueOnce({
      url: "https://github.com/test/repo",
      title: "test/repo",
      content: "├── src/\n└── package.json",
      error: null,
    })
    .mockResolvedValueOnce(null); // falls back to extractContent for second GitHub URL
  state.extractContent.mockResolvedValue({
    url: "https://github.com/test/repo/blob/main/README.md",
    title: "README",
    content: "R".repeat(1500),
    error: null,
  });

  offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-fallback-gh.txt");

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
  const result = await fetchContentTool.execute(
    "call-gh-mixed",
    { urls: ["https://github.com/test/repo", "https://github.com/test/repo/blob/main/README.md"] },
    undefined,
    undefined,
    ctx
  );
  expect(offloadState.offloadToFile).toHaveBeenCalledTimes(1);
  const text = getText(result);
  expect(text).toContain("test/repo");
  expect(text).toContain("├── src/");
  expect(text).toContain("/tmp/pi-web-fallback-gh.txt");
});
```

**Step 2 — Run tests, verify at least one fails pre-fix**

Run:
- `npx vitest run index.test.ts -t "keeps single-url GitHub clone result inline (no file-first)"`
- `npx vitest run index.test.ts -t "only successful GitHub clone URLs stay inline in mixed multi-url raw fetches"`

Expected: second test FAILS — `expected "spy" to be called 1 times, but got 0 times` when GitHub detection is incorrectly done at render time via `parseGitHubUrl(r.url)`.

**Step 3 — Write minimal implementation**

In `index.ts`, track successful GitHub clone extraction at fetch time:

1. In `fetch_content` execution scope, add:

```typescript
const githubCloneUrls = new Set<string>();
```

2. In `fetchOne`, use:

```typescript
const ghInfo = parseGitHubUrl(targetUrl);
if (ghInfo) {
  const ghResult = await extractGitHub(targetUrl, combinedSignal, forceClone);
  if (ghResult) {
    githubCloneUrls.add(ghResult.url);
    return ghResult;
  }
}
return extractContent(targetUrl, combinedSignal);
```

3. In both single-url and multi-url **no-prompt** branches, check:

```typescript
const isGitHubCloneResult = githubCloneUrls.has(r.url);
```

Use `isGitHubCloneResult` for inline-vs-file-first behavior (not `parseGitHubUrl(r.url)`).

**Step 4 — Run tests, verify they pass**

Run the same two commands from Step 2.

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.

### Task 16: File-first temp files are cleaned up on session shutdown [no-test] [depends: 11]

### Task 16: File-first temp files are cleaned up on session shutdown [no-test] [depends: 11]

**AC covered:** AC 18

**Justification:** Existing behavior is already covered by unit tests in `offload.test.ts`; this task verifies that coverage plus the shutdown call site wiring in `index.ts`.
**Files:**
- None

**Step 1 — Verify existing cleanup coverage and wiring**

Run:
- `npx vitest run offload.test.ts -t "removes all tracked temp files"`
- `grep -n "cleanupTempFiles\(\)" index.ts`

Expected:
- Vitest command PASS.
- Grep output shows `cleanupTempFiles()` in session shutdown handler.

### Task 17: get_search_content still returns full content from in-memory store after file-first [depends: 8, 11]

### Task 17: get_search_content still returns full content from in-memory store after file-first [depends: 8, 11]
**AC covered:** AC 19
**Files:**
- Modify: `index.test.ts`

**Step 1 — Write the failing test**

In `index.test.ts`, add a helper and test:

```typescript
async function getFetchAndGetSearchContentTools() {
  vi.resetModules();

  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => {
      tools.set(def.name, def);
    }),
    appendEntry: vi.fn(),
  };

  // Intentionally use current default config (get_search_content disabled) so this fails first.
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);

  const fetchContentTool = tools.get("fetch_content");
  const getSearchContentTool = tools.get("get_search_content");

  if (!fetchContentTool) throw new Error("fetch_content tool was not registered");
  if (!getSearchContentTool) throw new Error("get_search_content tool was not registered");

  return { fetchContentTool, getSearchContentTool };
}

it("get_search_content still returns full content from in-memory store after file-first fetch", async () => {
  state.extractContent.mockResolvedValue({
    url: "https://example.com/page",
    title: "Example Page",
    content: "A".repeat(2000),
    error: null,
  });
  offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-full.txt");

  const { fetchContentTool, getSearchContentTool } = await getFetchAndGetSearchContentTools();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

  const fetchResult = await fetchContentTool.execute(
    "call-fetch",
    { url: "https://example.com/page" },
    undefined,
    undefined,
    ctx
  );

  const fetchText = getText(fetchResult);
  expect(fetchText).toContain("Full content saved to");

  const responseId = fetchResult.details.responseId;
  const fullResult = await getSearchContentTool.execute(
    "call-get",
    { responseId, url: "https://example.com/page" },
    undefined,
    undefined,
    ctx
  );

  const fullText = getText(fullResult);
  expect(fullText).toContain("# Example Page");
  expect(fullText).toContain("A".repeat(2000));
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "get_search_content still returns full content from in-memory store after file-first fetch"`

Expected: FAIL — `Error: get_search_content tool was not registered`.

**Step 3 — Write minimal implementation**

In the same helper, enable `get_search_content` registration by temporarily mutating `configState.value.tools` (from Task 8), then restore it:

```typescript
async function getFetchAndGetSearchContentTools() {
  vi.resetModules();

  const previousTools = { ...configState.value.tools };
  configState.value.tools = {
    web_search: false,
    fetch_content: true,
    code_search: false,
    get_search_content: true,
  };

  const tools = new Map<string, any>();
  const pi = {
    on: vi.fn(),
    registerTool: vi.fn((def: any) => {
      tools.set(def.name, def);
    }),
    appendEntry: vi.fn(),
  };

  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);

  configState.value.tools = previousTools;

  const fetchContentTool = tools.get("fetch_content");
  const getSearchContentTool = tools.get("get_search_content");
  if (!fetchContentTool) throw new Error("fetch_content tool was not registered");
  if (!getSearchContentTool) throw new Error("get_search_content tool was not registered");

  return { fetchContentTool, getSearchContentTool };
}
```

No production code changes are needed.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "get_search_content still returns full content from in-memory store after file-first fetch"`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.

### Task 18: fetch_content returns inline with warning when temp file write fails [depends: 11, 13]

### Task 18: fetch_content returns inline with warning when temp file write fails [depends: 11, 13]

**AC covered:** AC 21
**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`
**Step 1 — Write the failing test (multi-URL raw failure fallback)**

Add to `describe("fetch_content file-first storage", ...)` in `index.test.ts`:

```typescript
it("returns warning + inline preview for failed file writes in multi-url raw mode", async () => {
  state.extractContent.mockImplementation(async (url: string) => {
    if (url === "https://a.example/page") {
      return { url, title: "Page A", content: "A".repeat(1200), error: null };
    }
    return { url, title: "Page B", content: "B".repeat(1200), error: null };
  });

  offloadState.offloadToFile.mockImplementation((text: string) => {
    if (text.includes("# Page B")) {
      throw new Error("ENOSPC");
    }
    return "/tmp/pi-web-page-a.txt";
  });
  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
  const result = await fetchContentTool.execute(
    "call-multi-write-fail",
    { urls: ["https://a.example/page", "https://b.example/page"] },
    undefined,
    undefined,
    ctx
  );
  const text = getText(result);
  expect(text).toContain("/tmp/pi-web-page-a.txt");
  expect(text).toContain("⚠ Could not write temp file. Returning inline.");
  expect(text).toContain("Preview: # Page B");
  expect(text).not.toContain("Page B — could not write temp file");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "returns warning + inline preview for failed file writes in multi-url raw mode"`

Expected: FAIL — `expected text to contain "⚠ Could not write temp file. Returning inline."`

**Step 3 — Write minimal implementation**

In `index.ts`, update Task 13’s multi-URL raw loop catch block.

Replace:

```typescript
lines.push(`${i + 1}. ⚠ ${r.title} — could not write temp file`);
lines.push(`   ${r.url}`);
continue;
```

with inline-warning preview fallback:

```typescript
lines.push(`${i + 1}. ⚠ ${r.title}`);
lines.push(`   ${r.url}`);
lines.push("   ⚠ Could not write temp file. Returning inline.");
const inlinePreview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
lines.push(`   Preview: ${inlinePreview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
lines.push("");
continue;
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "returns warning + inline preview for failed file writes in multi-url raw mode"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.

### Task 19: Update fetch_content tool description to mention file-first behavior [no-test] [depends: 11]

### Task 19: Update fetch_content tool description to mention file-first behavior [no-test] [depends: 11]

**AC covered:** AC 22

**Justification:** Tool description text change only — no observable behavior to test.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

In `index.ts`, update the `fetch_content` tool's `description` field (around line 323-324):

From:
```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).",
```

To:
```typescript
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).\n\nRaw fetches (without `prompt`) return a preview + file path. Use `read` to explore the full content selectively.",
```

**Step 2 — Verify**

Run: `npx vitest run`

Expected: All tests passing — no behavioral change.

### Task 20: tool_result interceptor remains unchanged for code_search/get_search_content offloading [depends: 11]

### Task 20: tool_result interceptor remains unchanged for code_search/get_search_content offloading [depends: 11]

**AC covered:** AC 20
**Files:**
- Test: `index.test.ts`
**Step 1 — Write the regression test (reuse existing offloadState mock)**

Do **not** redeclare `offloadState`. Reuse the one introduced earlier in `index.test.ts` and add this test:

```typescript
async function getToolResultHandler() {
  vi.resetModules();
  const handlers = new Map<string, any>();
  const pi = {
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  const handler = handlers.get("tool_result");
  if (!handler) throw new Error("tool_result handler not registered");
  return handler;
}
it("offloads large code_search/get_search_content results and leaves small ones unchanged", async () => {
  const handler = await getToolResultHandler();
  offloadState.shouldOffload.mockReturnValueOnce(true);
  offloadState.offloadToFile.mockReturnValueOnce("/tmp/pi-web-large.txt");
  offloadState.buildOffloadResult.mockReturnValueOnce("preview + file path");
  const largeIntercept = await handler({
    toolName: "code_search",
    isError: false,
    content: [{ type: "text", text: "X".repeat(40_000) }],
  });
  expect(offloadState.offloadToFile).toHaveBeenCalledWith("X".repeat(40_000));
  expect(largeIntercept).toEqual({
    content: [{ type: "text", text: "preview + file path" }],
  });

  offloadState.shouldOffload.mockReturnValueOnce(false);
  const smallIntercept = await handler({
    toolName: "get_search_content",
    isError: false,
    content: [{ type: "text", text: "short" }],
  });
  expect(smallIntercept).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "offloads large code_search/get_search_content results and leaves small ones unchanged"`

Expected: FAIL — `TypeError: offloadState.shouldOffload.mockReturnValueOnce is not a function` (existing mock shape only had `offloadToFile`).

**Step 3 — Minimal implementation (test mock shape only)**

In `index.test.ts`, update the **existing** top-level offload mock shape from:

```typescript
const offloadState = vi.hoisted(() => ({ offloadToFile: vi.fn() }));
```

to:

```typescript
const offloadState = vi.hoisted(() => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: vi.fn(),
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));
```

And ensure there is a **single** `vi.mock("./offload.js", ...)` block wired to this object:

```typescript
vi.mock("./offload.js", () => ({
  shouldOffload: offloadState.shouldOffload,
  offloadToFile: offloadState.offloadToFile,
  buildOffloadResult: offloadState.buildOffloadResult,
  cleanupTempFiles: offloadState.cleanupTempFiles,
  FILE_FIRST_PREVIEW_SIZE: 500,
}));
```

**Step 4 — Re-run test, verify it passes**

Run: `npx vitest run index.test.ts -t "offloads large code_search/get_search_content results and leaves small ones unchanged"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.
