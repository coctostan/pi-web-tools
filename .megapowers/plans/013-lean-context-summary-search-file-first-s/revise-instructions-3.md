## Task 8: web_search tool schema includes detail parameter and passes it to searchExa

Two issues to fix:

1. **Mock isolation bug in Step 1**
   - Current plan uses `vi.doMock("./config.js", ...)` inside `getWebSearchTool()`.
   - In this codebase, that can leak between tests in `index.test.ts` after `vi.resetModules()` and break existing `fetch_content` tests (because `tools.fetch_content` gets turned off).

   Replace that pattern with a **single hoisted config state mock** used by all tests:

```ts
const configState = vi.hoisted(() => ({
  value: {
    exaApiKey: null,
    filterModel: undefined,
    github: { maxRepoSizeMB: 350, cloneTimeoutSeconds: 30, clonePath: "/tmp/pi-github-repos" },
    tools: { web_search: false, fetch_content: true, code_search: false, get_search_content: false },
  },
}));

vi.mock("./config.js", () => ({
  getConfig: () => configState.value,
  resetConfigCache: vi.fn(),
}));
```

Then, in the web_search helper/test setup, mutate `configState.value.tools` before importing `index.js`:

```ts
configState.value.tools = {
  web_search: true,
  fetch_content: false,
  code_search: false,
  get_search_content: false,
};
```

2. **Granularity**
   - Keep Task 8 to one test file. Do not split this task across both `index.test.ts` and `tool-params.test.ts`.
   - AC8/AC9 can be verified through `index.test.ts` (schema + execute pass-through).

Implementation in Step 3 is otherwise correct (`detail` in `WebSearchParams`, `normalizeWebSearchInput`, and pass-through to `searchExa`).

---

## Task 12: fetch_content prompt fallback writes to temp file instead of inlining

Task 12 currently updates only the **single-URL prompt fallback** (`index.ts` around the block currently using `MAX_INLINE_CONTENT` at lines ~405-424). That is not enough for AC14/AC17.

You must also cover the **multi-URL prompt fallback path** in `index.ts` (current fallback block around lines ~474-479 still truncates with `MAX_INLINE_CONTENT`).

### Required plan changes

1. **Step 1 test coverage**
   Add a failing test for multi-URL prompt mode where at least one URL has `filterResult.filtered === null`:
   - assert `offloadState.offloadToFile` is called for that fallback block
   - assert output includes `Full content saved to ...`
   - assert output does **not** include `Content truncated` / `MAX_INLINE_CONTENT` messaging

2. **Step 3 implementation**
   Replace multi-URL prompt fallback truncation logic:

```ts
let fallbackText = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
if (fallbackText.length > MAX_INLINE_CONTENT) {
  ...
}
return fallbackText;
```

with file-first logic aligned to your single-URL fallback approach:

```ts
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

3. **Step 5 verification command**
   Keep `grep -n "MAX_INLINE_CONTENT" index.ts`, but expected result must be:
   - no match in single-URL prompt fallback block
   - no match in multi-URL prompt fallback block
   - remaining usage only in non-fetch fallback paths (e.g. `code_search`)

---

## Task 14: fetch_content with prompt and successful filter returns inline without writing file

Current no-test version is not strict enough for AC13. It says “ensure this assertion is present” but does not actually require adding/verifying it in a deterministic way.

Revise Task 14 into a concrete test task (or explicitly add this assertion in a prior task and reference exact line/test name).

### Minimum required assertion

In the prompt-success test path, include:

```ts
expect(offloadState.offloadToFile).not.toHaveBeenCalled();
```

and keep inline output assertion:

```ts
expect(getText(filteredResult)).toBe("Source: https://example.com/docs\n\n100 requests/minute.");
```

If you keep Task 14 as `[no-test]`, then Step 1 must include an exact grep/read verification target (test name + assertion text) so it is executable without ambiguity.

---

## Task 17: get_search_content still returns full content from in-memory store after file-first

Current Step 1 references a test name that does not exist in `index.test.ts`, so the task is not executable as written.

Make this a real test task with concrete setup.

### Step 1 test to add

Add a test that:
1. enables both `fetch_content` and `get_search_content` tool registration in config mock
2. executes `fetch_content` for a raw URL (file-first path)
3. reads `responseId` from `fetch_content` result details
4. executes `get_search_content` with that `responseId` + URL
5. asserts returned text contains full stored content (not just 500-char preview)

Use actual tool API from `index.ts`:
- `fetch_content.execute(..., { url: "..." }, ... )`
- `get_search_content.execute(..., { responseId, url: "..." }, ... )`

### Example assertions

```ts
expect(fetchText).toContain("Full content saved to");
expect(getText(fullResult)).toContain("# Example Page");
expect(getText(fullResult)).toContain("A".repeat(2000));
```

### Step 2 expected failure

Before adding this test/setup, failure should be explicit (e.g. `get_search_content tool was not registered` or missing test).

### Step 5

Run full suite: `npx vitest run` and expect all passing.
