## Task 8: Wire filterContent into fetch_content single-URL path

You fixed the biggest gap (testing `fetch_content.execute(...)` directly), but the test harness is still fragile because it mixes:
- top-level imported mocks (`extractContent`, `filterContent`), and
- `vi.resetModules()` before dynamically importing `index.ts`.

That combination can point your assertions at a different mock instance than the one `index.ts` calls.

### Step 1 changes required

Use **hoisted stable mock functions** and assert against those, not against directly imported functions.

Replace the current mock setup pattern with this shape:

```ts
const state = vi.hoisted(() => ({
  extractContent: vi.fn(),
  filterContent: vi.fn(),
}));

vi.mock("./extract.js", () => ({
  extractContent: state.extractContent,
  fetchAllContent: vi.fn(),
}));

vi.mock("./filter.js", () => ({
  filterContent: state.filterContent,
}));
```

Then in the test, configure:

```ts
state.extractContent.mockResolvedValue({
  url: "https://example.com/docs",
  title: "Docs",
  content: "RAW PAGE",
  error: null,
});

state.filterContent
  .mockResolvedValueOnce({ filtered: "100 requests/minute.", model: "anthropic/claude-haiku-4-5" })
  .mockResolvedValueOnce({ filtered: null, reason: "No filter model available (tried anthropic/claude-haiku-4-5, openai/gpt-4o-mini)" });
```

And assert on `state.filterContent` calls (not `vi.mocked(filterContent)`).

### Add one explicit warning passthrough assertion

Right now the test only checks the no-model warning remap. Add a case where filter returns a non-no-model reason and assert it is preserved in output warning text:

```ts
state.filterContent.mockResolvedValueOnce({
  filtered: null,
  reason: "Filter model error: Rate limit exceeded",
});

expect(text).toContain("⚠ Filter model error: Rate limit exceeded");
```

This validates AC10 wiring at `fetch_content` level (not only in `filter.ts` unit tests).

## Task 9: Wire filterContent into fetch_content multi-URL path with p-limit(3)

This task is close, but it still misses one regression check required by AC13 for **multi-URL no-prompt** behavior.

### Step 1 changes required

Keep your prompt-mode test (`p-limit(3)` + filtered/fallback blocks), and add a second test in the same task that verifies:

1. `fetch_content.execute` with `urls` and **no `prompt`** returns the existing summary format:
   - starts with `Fetched <success>/<total> URLs. Response ID:`
   - includes numbered `✅`/`❌` lines
   - includes `Use get_search_content with responseId ...`
2. `filterContent` is **not called** in no-prompt mode.

Use the same hoisted mock state from Task 8 so module-reset behavior is deterministic.

### Step 2 expected failure update

Include a concrete failure for the new no-prompt regression assertion, e.g.:

`Expected: FAIL — expected text to contain "Fetched 3/3 URLs. Response ID:"`

### Step 3 implementation guardrail

Keep prompt branch using:

```ts
const limit = pLimit(3);
```

and for no-prompt mode, preserve the current summary path from `index.ts` (the existing `lines.push(...)` summary loop) so behavior remains unchanged.

Do not replace no-prompt behavior with block formatting.
