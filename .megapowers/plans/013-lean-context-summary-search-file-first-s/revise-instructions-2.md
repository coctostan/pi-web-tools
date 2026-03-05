## Task 2: searchExa sends highlights contents when detail is "highlights"

Step 2 currently expects **PASS**, which breaks the plan’s TDD requirement.

### What to change
- Convert this task to **[no-test]** and explicitly mark it as redundant coverage.
- Move AC2 ownership to Task 3 (the existing `"uses highlights content mode..."` test that Task 3 already updates to pass `detail: "highlights"`).

### Required edits
- In task frontmatter: set `no_test: true`.
- Replace Steps 1–5 with a no-test verification step:
  - Run: `npx vitest run exa-search.test.ts -t "uses highlights content mode with numSentences 3 and highlightsPerUrl 3"`
  - Expected: PASS.
- Update AC mapping text in Task 3 to include AC2.

---

## Task 5: parseExaResults still maps highlights to snippet when summary is absent

Step 2 currently expects **PASS** (no RED phase).

### What to change
- Convert to **[no-test]** and make Task 4’s test section explicitly own this compatibility coverage.

### Required edits
- In task frontmatter: set `no_test: true`.
- Replace Steps 1–5 with:
  - Verification command: `npx vitest run exa-search.test.ts -t "parses highlights response into snippet"`
  - Expected: PASS.
- In Task 4 notes, explicitly state fallback order is `summary -> highlights -> text -> ""` and AC5 is covered there.

---

## Task 6: parseExaResults produces empty snippet when no summary and no highlights

Step 2 currently expects **PASS** (no RED phase).

### What to change
- Convert this to **[no-test]** and fold AC7 coverage into Task 4 by expanding Task 4 Step 1 with an explicit "empty snippet" case in the same fixture-driven test block.

### Required edits
- Set `no_test: true` for Task 6.
- Replace Steps 1–5 with verification-only step referencing Task 4’s updated test.
- In Task 4, include this exact assertion:

```ts
expect(results[0].snippet).toBe("");
```

for a result object that has `title` and `url` only.

---

## Task 8: web_search tool schema includes detail parameter and passes it to searchExa

This task currently combines two ACs (schema + execution pass-through) in one test and does not lock input normalization behavior for invalid `detail` values.

### What to change
Keep Task 8, but split test intent into two focused tests in `index.test.ts`:
1. schema contains `detail` enum (`summary|highlights`) (AC8)
2. execute passes normalized `detail` to `searchExa` (AC9)

Also add normalization coverage in `tool-params.test.ts`:

```ts
it("normalizeWebSearchInput passes through valid detail", () => {
  expect(normalizeWebSearchInput({ query: "x", detail: "summary" }).detail).toBe("summary");
  expect(normalizeWebSearchInput({ query: "x", detail: "highlights" }).detail).toBe("highlights");
});

it("normalizeWebSearchInput ignores invalid detail", () => {
  expect(normalizeWebSearchInput({ query: "x", detail: "full" as any }).detail).toBeUndefined();
});
```

Use separate `-t` commands in Step 2/4 for each new test.

---

## Task 12: fetch_content prompt fallback writes to temp file instead of inlining

Task 12 only exercises multi-URL fallback, but AC14/AC17 apply to prompt fallback paths generally. The single-URL prompt fallback in `index.ts` (currently around the `filterResult.filtered` false branch) still uses `MAX_INLINE_CONTENT` truncation.

### What to change
Add a **single-URL prompt fallback** failing test and implementation.

### Required test (add in Step 1)

```ts
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
  offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-fallback.txt");

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
  const result = await fetchContentTool.execute(
    "call-single-fallback",
    { url: "https://example.com/page", prompt: "What matters?" },
    undefined,
    undefined,
    ctx
  );

  expect(offloadState.offloadToFile).toHaveBeenCalledOnce();
  const text = getText(result);
  expect(text).toContain("/tmp/pi-web-fallback.txt");
  expect(text).toContain("Full content saved to");
  expect(text).not.toContain("Content truncated at 30000 chars");
});
```

### Required implementation (Step 3)
Replace this single-url fallback block in `index.ts`:

```ts
let text = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
let truncated = false;
if (text.length > MAX_INLINE_CONTENT) {
  ...
}
return { content: [{ type: "text", text }], details: { ..., truncated, filtered: false } };
```

with file-first logic parallel to raw file-first:

```ts
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
        preview,
        fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : "",
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
    details: { responseId, url: r.url, title: r.title, charCount: r.content.length, filtered: false, fileFirstFailed: true },
  };
}
```

---

## Task 14: fetch_content with prompt and successful filter returns inline without writing file

Step 2 currently expects **PASS**. This is a regression lock and should be a no-test verification task (or merged into Task 12) rather than a fake RED/GREEN task.

### What to change
- Convert Task 14 to **[no-test]**.
- Keep a single verification step that runs the existing prompt-success test.

Use:
`npx vitest run index.test.ts -t "uses filterContent in prompt mode"`

Expected: PASS, and include assertion:

```ts
expect(offloadState.offloadToFile).not.toHaveBeenCalled();
```

---

## Task 15: GitHub clone results are returned inline without file-first

Current implementation suggestion uses `parseGitHubUrl(r.url) !== null` at render time. That can misclassify GitHub URLs that **fell back to normal extraction**.

### What to change
Track successful GitHub clone extraction at fetch time.

### Required implementation pattern
In `fetch_content` execute scope, add:

```ts
const githubCloneUrls = new Set<string>();
```

In `fetchOne`:

```ts
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

Then in single and multi no-prompt branches, check:

```ts
const isGitHubCloneResult = githubCloneUrls.has(r.url);
```

(not `parseGitHubUrl(r.url)`).

### Required test additions
Add a **single-url GitHub** test as well as mixed multi-url test. Single-url test should assert:
- `offloadToFile` not called
- returned text includes tree content (e.g. `├── src/`)

---

## Task 16: File-first temp files are cleaned up on session shutdown

Step 2 currently expects PASS. Either make this a real integration RED/GREEN task or convert to no-test.

### What to change
Convert to **[no-test]** and explicitly point to existing coverage in `offload.test.ts` (`"removes all tracked temp files"`) plus `index.ts` shutdown handler call site.

Add verification commands:
- `npx vitest run offload.test.ts -t "removes all tracked temp files"`
- `grep -n "cleanupTempFiles\(\)" index.ts`

---

## Task 17: get_search_content still returns full content from in-memory store after file-first

Step 2 currently expects PASS. Keep as validation, but mark as no-test task to satisfy plan consistency.

### What to change
- Set `no_test: true`.
- Replace RED/GREEN framing with verification framing.
- Verification command:
  - `npx vitest run index.test.ts -t "get_search_content still returns full content from in-memory store after file-first fetch"`

Also ensure the helper name doesn’t collide with existing helpers and that config mock enabling `get_search_content` is localized to that helper.

---

## Task 18: fetch_content returns inline with warning when temp file write fails

As written, Step 2 expects PASS because Task 11 already adds single-URL catch logic.

### What to change
Make this a real RED/GREEN by targeting the **multi-URL raw path** fallback, which currently only emits a generic line and does not include inline content for failed file writes.

### Replace Step 1 test with
- multi-URL no-prompt call
- make `offloadToFile` throw for one URL
- assert returned text includes warning + inline snippet for that URL, not just "could not write temp file"

### Expected Step 2 failure
`expected text to contain "⚠ Could not write temp file. Returning inline."`

### Required implementation in Task 18
In Task 13’s multi-URL loop catch block, replace:

```ts
lines.push(`${i + 1}. ⚠ ${r.title} — could not write temp file`);
lines.push(`   ${r.url}`);
continue;
```

with inline-warning fallback output, e.g.:

```ts
lines.push(`${i + 1}. ⚠ ${r.title}`);
lines.push(`   ${r.url}`);
lines.push("   ⚠ Could not write temp file. Returning inline.");
const inlinePreview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
lines.push(`   Preview: ${inlinePreview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
lines.push("");
continue;
```

---

## Task 20: tool_result interceptor remains unchanged for code_search/get_search_content offloading

Current task introduces a second `offloadState` mock definition that will conflict with the one added earlier in `index.test.ts` (Task 11 path).

### What to change
1. Add dependency on Task 11: `depends_on: [11]`.
2. Reuse the existing `offloadState` object instead of redefining it.
3. Extend the existing offload mock shape once (top of file) to include:
   - `shouldOffload`
   - `buildOffloadResult`
   - `cleanupTempFiles`

### Concrete correction
If you already have:

```ts
const offloadState = vi.hoisted(() => ({ offloadToFile: vi.fn() }));
```

change it to:

```ts
const offloadState = vi.hoisted(() => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: vi.fn(),
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));
```

and use a single `vi.mock("./offload.js", ...)` block.

Do not redeclare `offloadState` later in the file.
