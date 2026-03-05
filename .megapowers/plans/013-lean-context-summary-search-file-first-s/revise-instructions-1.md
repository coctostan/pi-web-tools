## Task 1: searchExa sends summary contents when detail is "summary"

Step 2’s expected failure is incorrect for this repo. `vitest` transpiles TS but does **not** type-check, so you will not get a TypeScript compile error about `detail`.

Use this expected failure instead:

```text
FAIL — expected { highlights: { numSentences: 3, highlightsPerUrl: 3 } } to deeply equal { summary: true }
```

Also, in Step 5 avoid hardcoding a test count (`123`). Use:

```text
Expected: All tests passing.
```

---

## Task 7: formatSearchResults does not truncate short summary-mode snippets

This task currently does not validate AC 6. Testing a snippet under 200 chars passes even with current truncation logic, so it cannot catch the required behavior change.

### What to change

1. Replace Step 1 test with a summary string **over 200 chars** and assert it is not truncated:

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

2. Update Step 3 implementation in `exa-search.ts` to stop truncating in `formatSearchResults`:

```typescript
// replace
const preview = r.snippet.length > 200 ? r.snippet.slice(0, 200) + "…" : r.snippet;
parts.push(`   ${preview}`);

// with
parts.push(`   ${r.snippet}`);
```

This is the minimal implementation that actually satisfies AC 6.

---

## Task 8: web_search tool schema includes detail parameter and passes it to searchExa

Current tests only cover `normalizeWebSearchInput`. They do not verify the two core ACs for this task:
- AC 8: schema includes `detail`
- AC 9: `web_search` execute passes `detail` to `searchExa`

### What to change

Add integration coverage in `index.test.ts` with `web_search` enabled and `searchExa` mocked.

1. Add/extend mocks:

```typescript
const exaState = vi.hoisted(() => ({
  searchExa: vi.fn(),
  formatSearchResults: vi.fn(),
}));

vi.mock("./exa-search.js", () => ({
  searchExa: exaState.searchExa,
  formatSearchResults: exaState.formatSearchResults,
}));
```

2. Register `web_search` in test config for this task and assert schema:

```typescript
expect(webSearchTool.parameters.properties.detail).toBeDefined();
```

3. Execute `web_search` with `{ query: "x", detail: "highlights" }` and assert pass-through:

```typescript
expect(exaState.searchExa).toHaveBeenCalledWith(
  "x",
  expect.objectContaining({ detail: "highlights" })
);
```

Without this, AC 8/9 are not actually protected by tests.

---

## Task 12: fetch_content prompt fallback writes to temp file instead of inlining

This task updates only the single-URL prompt fallback path. AC 14 + AC 17 also require removing inline/truncation fallback behavior for prompt-failure paths generally, including multi-URL prompt mode.

### What to change

1. Add a multi-URL prompt test where one URL fails filtering and assert file-first behavior for that URL:

```typescript
expect(offloadState.offloadToFile).toHaveBeenCalled();
expect(getText(result)).toContain("Full content saved to");
expect(getText(result)).toContain("/tmp/pi-web-abc123.txt");
```

2. In `index.ts`, update the multi-URL prompt fallback branch (currently using `MAX_INLINE_CONTENT`) to use the same file-first pattern as single-URL fallback:
- build full fallback text
- `offloadToFile(fullText)`
- return 500-char preview + file path
- if write fails, inline with warning for that block

3. Ensure `MAX_INLINE_CONTENT` is no longer used in any raw or fallback branch inside `fetch_content`.

---

## Task 15: GitHub clone results are returned inline without file-first

### Dependency fix

Step 3 modifies the multi-URL file-first block introduced in Task 13, but this task only depends on Task 11.

Update frontmatter:

```yaml
depends_on:
  - 11
  - 13
```

### Implementation robustness

Avoid relying only on `githubUrls.has(r.url)` string equality for final decision points. Use URL parsing directly at decision time (or explicit metadata) so canonicalization/trailing-slash differences do not break behavior.

For example in result formatting branches:

```typescript
const isGitHubResult = parseGitHubUrl(r.url) !== null;
if (isGitHubResult) {
  // inline path
}
```

### Test completeness

Add a mixed multi-URL test (GitHub + non-GitHub) and assert:
- GitHub entry is inline
- non-GitHub entry uses file-first
- `offloadToFile` call count matches only non-GitHub successes

---

## Add Task 20 (new): AC 20 regression for tool_result interceptor

AC 20 is currently uncovered in the plan matrix (`— No changes needed`). It still needs a regression check.

Add a focused test task that verifies the `tool_result` interceptor behavior remains intact for `code_search` / `get_search_content`:

- Register extension and capture `pi.on("tool_result", handler)`
- Mock `shouldOffload`, `offloadToFile`, and `buildOffloadResult`
- Call handler with `toolName: "code_search"` and large text content
- Assert handler returns replacement content from `buildOffloadResult`
- Assert small content returns `undefined` (no interception)

This closes AC 20 without changing existing interceptor logic.