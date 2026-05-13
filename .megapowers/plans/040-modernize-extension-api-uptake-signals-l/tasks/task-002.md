---
id: 2
title: "fetch_content: forward execute()'s signal directly to extractors and
  filter completion"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
  - filter.ts
files_to_create: []
---

Forward the pi-provided `signal` directly to `extractContent`, `extractGitHub`, `filterContent`, and the `complete(...)` call made inside `filterContent`. (AC-CANCEL-2)

**Files:**
- Modify: `index.ts`
- Modify: `filter.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing tests**

Append to `index.test.ts`:

```ts
describe("fetch_content cancellation (#033 AC-CANCEL-2)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("forwards the execute() signal directly to extractContent", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    state.extractContent.mockResolvedValueOnce({ url: "https://example.com", title: "T", content: "C", error: null });
    offloadState.shouldOffload.mockReturnValue(false);

    const externalSignal = new AbortController().signal;
    await fetchContentTool.execute(
      "call-1",
      { urls: ["https://example.com"], forceClone: undefined, prompt: undefined, noCache: true },
      externalSignal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" }, modelRegistry: {} } as any,
    );

    expect(state.extractContent).toHaveBeenCalledTimes(1);
    expect(state.extractContent.mock.calls[0][1]).toBe(externalSignal);
  });

  it("passes the execute() signal through filterContent for focused fetch completion", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    state.extractContent.mockResolvedValueOnce({ url: "https://example.com", title: "T", content: "raw page", error: null });
    state.filterContent.mockResolvedValueOnce({ filtered: "focused answer long enough", model: "anthropic/claude-haiku-4-5" });

    const externalSignal = new AbortController().signal;
    await fetchContentTool.execute(
      "call-filter-signal",
      { urls: ["https://example.com"], forceClone: undefined, prompt: "summarize", noCache: true },
      externalSignal,
      undefined,
      { sessionManager: { getEntries: () => [], getSessionId: () => "s1" }, modelRegistry: {} } as any,
    );

    expect(state.filterContent).toHaveBeenCalledTimes(1);
    expect(state.filterContent.mock.calls[0][5]).toBe(externalSignal);
  });
});
```

**Step 2 — Run tests, verify they fail**
Run: `npx vitest run index.test.ts -t "fetch_content cancellation \(#033 AC-CANCEL-2\)"`
Expected: FAIL — the first test reports `expect(state.extractContent.mock.calls[0][1]).toBe(externalSignal)` received the wrapper `AbortSignal.any(...)` signal; after that is fixed, the second test reports `expect(state.filterContent.mock.calls[0][5]).toBe(externalSignal)` received `undefined` because `fetch_content.execute` currently calls `filterContent(..., complete)` with only five arguments.

**Step 3 — Write minimal implementation**

In `index.ts`, inside `fetch_content`'s `async execute(_toolCallId, params, signal, _onUpdate, ctx)`:

1. Remove the lines:

```ts
const abortController = new AbortController();
const fetchId = generateId();
pendingFetches.set(fetchId, abortController);

const combinedSignal = signal
  ? AbortSignal.any([signal, abortController.signal])
  : abortController.signal;
```

2. Inside `fetchOne`, replace:

```ts
const ghResult = await extractGitHub(targetUrl, combinedSignal, forceClone);
return extractContent(targetUrl, combinedSignal);
```

with:

```ts
const ghResult = await extractGitHub(targetUrl, signal, forceClone);
return extractContent(targetUrl, signal);
```

3. Remove the outer `try { ... } finally { pendingFetches.delete(fetchId); }` wrapper — the body inside `try` becomes the body of `execute`. Inner `try/catch` blocks for individual URL handling stay.

4. At both `filterContent(...)` call sites in `fetch_content.execute`, pass `signal` as the sixth argument:

```ts
const filterResult = await filterContent(
  r.content,
  prompt,
  ctx.modelRegistry,
  config.filterModel,
  complete,
  signal,
);
```

In `filter.ts`, update the real signature and the `completeFn` options. Replace:

```ts
type CompleteFn = (model: Model<Api>, context: Context, options?: ProviderStreamOptions) => Promise<AssistantMessage>;
```

with the same type alias (no type change required), then change `filterContent` from:

```ts
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn
): Promise<FilterResult> {
```

to:

```ts
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn,
  signal?: AbortSignal
): Promise<FilterResult> {
```

and replace:

```ts
const response = await completeFn(model, context, { apiKey, headers });
```

with:

```ts
const response = await completeFn(model, context, { apiKey, headers, signal });
```

**Step 4 — Run tests, verify they pass**
Run: `npx vitest run index.test.ts -t "fetch_content cancellation \(#033 AC-CANCEL-2\)"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
