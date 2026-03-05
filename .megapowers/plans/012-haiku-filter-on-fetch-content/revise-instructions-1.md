## Task 8: Wire filterContent into fetch_content single-URL path

Your current Task 8 test does **not** test wiring in `index.ts` (it only tests a local formatting helper). Replace Task 8 with a real tool-execute integration test in `index.test.ts` that exercises the registered `fetch_content` tool.

### Step 1 (replace)
Write a failing test that:

1. Mocks `./extract.js` to return one successful page result.
2. Mocks `./filter.js` and spies on `filterContent`.
3. Registers tools via `default export` from `index.ts` into a fake `pi` object that implements:
   - `on()`
   - `registerTool(def)` (capture by `def.name`)
   - `appendEntry()`
4. Calls `fetch_content.execute(..., { url, prompt }, ..., ctx)` with a `ctx` containing `modelRegistry`.
5. Asserts:
   - `filterContent` is called with extracted page content + prompt + `ctx.modelRegistry`
   - returned text is exactly `Source: <url>\n\n<filtered answer>`
   - when `prompt` is omitted, output stays the existing raw format (`# <title>\n\n<content>`) to cover no-regression behavior.

Use explicit assertions for AC coverage:

```ts
expect(filterContentSpy).toHaveBeenCalledWith(
  "RAW PAGE",
  "What is the rate limit?",
  ctx.modelRegistry,
  undefined,
  expect.any(Function)
);
expect(text).toBe("Source: https://example.com/docs\n\n100 requests/minute.");
```

### Step 2 (replace)
Keep the same command, but use a specific expected failure from the new test, e.g.:

`Expected: FAIL — "expected \"spy\" to be called at least once"`

### Step 3 (replace)
Implementation must be in `index.ts` (not only in `filter.ts`):

1. Rename execute arg `_ctx` → `ctx` for `fetch_content`.
2. Read `prompt` from `normalizeFetchContentInput(params)`.
3. In the single-URL branch, when `prompt` is present:
   - call `filterContent(r.content, prompt, ctx.modelRegistry, config.filterModel, complete)`
   - on success return `Source: ${r.url}\n\n${filtered}`
   - on fallback return raw content prefixed with warning.

For AC9 exact warning text, ensure no-model case is:

```ts
const reason = filterResult.reason.startsWith("No filter model available")
  ? "No filter model available. Returning raw content."
  : filterResult.reason;
const text = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
```

### Step 4/5
Keep Step 4 and Step 5, but Step 5 command should match project convention from `AGENTS.md`:

`npm test`

---

## Task 9: Wire filterContent into fetch_content multi-URL path with p-limit(3)

Current Task 9 also only tests formatting helpers and does not verify `index.ts` multi-URL wiring or `p-limit(3)` usage.

### Step 1 (replace)
Write a failing integration test (in `index.test.ts`) for multi-URL prompt mode:

1. Mock `extractContent` to return multiple successful URL results.
2. Mock `filterContent` to return filtered output for some URLs and fallback (`filtered: null`) for others.
3. Mock `p-limit` and assert it is created with concurrency `3`.
4. Execute `fetch_content` with `urls: [...]` + `prompt`.
5. Assert:
   - `pLimit` called with `3`
   - `filterContent` called once per non-error URL
   - response includes filtered blocks for successes (`Source: <url>`) 
   - fallback URLs include warning + raw content (not just an error line), preserving AC9/10/11 semantics.

### Step 2 (replace)
Use specific failure expectation from this new test, e.g.:

`Expected: FAIL — "expected pLimit to have been called with: [3]"`

### Step 3 (replace)
Implement in `index.ts` multi-URL branch:

- Add `import pLimit from "p-limit"`.
- In prompt mode, process filtering with `const limit = pLimit(3)` and `Promise.all(limit(() => ...))`.
- Build output per URL:
  - success: `Source: <url>\n\n<filtered>`
  - fallback: `⚠ <reason>\n\n# <title>\n\n<raw content>`
  - fetch error: existing error format is fine.

Do **not** satisfy this task only by adding `formatFilteredMultiUrl()` tests/helpers in `filter.ts`; the behavior must be verified via `fetch_content` execution path.

### Dependency correction
Update task metadata dependencies so this task depends on fallback behavior tasks too (`[depends: 5, 6, 8]`), since it relies on those semantics.
