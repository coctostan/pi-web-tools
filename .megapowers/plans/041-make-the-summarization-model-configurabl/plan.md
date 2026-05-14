# Plan

### Task 1: Reject malformed filterModel values

Covers AC 1, AC 2, AC 3, AC 12.

**Files:**
- Modify: `config.ts`
- Test: `config.test.ts`

**Step 1 — Write the failing test**
Add this test in `config.test.ts` near the existing `filterModel` tests:

```ts
  it("ignores malformed filterModel strings", () => {
    for (const value of ["provider/", "/model", "noslash", "", 42, null]) {
      writeFileSync(configPath, JSON.stringify({ filterModel: value }));
      resetConfigCache();
      const config = getConfig();
      expect(config.filterModel).toBeUndefined();
    }
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run config.test.ts -t "ignores malformed filterModel strings"`
Expected: FAIL — `AssertionError: expected 'provider/' to be undefined`

**Step 3 — Write minimal implementation**
In `config.ts`, replace the current `filterModel` parsing block:

```ts
  const filterModel = typeof file["filterModel"] === "string" && file["filterModel"].includes("/")
    ? file["filterModel"]
    : undefined;
```

with:

```ts
  const rawFilterModel = file["filterModel"];
  const filterModel = typeof rawFilterModel === "string" && /^[^/\s]+\/\S.*$/.test(rawFilterModel)
    ? rawFilterModel
    : undefined;
```

This keeps the existing `filterModel` field, requires a non-empty provider before `/`, and requires a non-empty model id after `/`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run config.test.ts -t "ignores malformed filterModel strings"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 2: Skip auto-detect cache reads before effective model is known [depends: 1]

Covers AC 6, AC 8, AC 9, AC 12.

**Files:**
- Modify: `index.test.ts`
- Modify: `index.ts`

**Step 1 — Write the failing test**
In `index.test.ts`, inside `describe("fetch_content research cache integration", ...)`, replace the existing test named `passes default filter cache candidates in auto-detect order` with this test:

```ts
  it("skips cache read in auto-detect mode so stale answers from another model are not reused", async () => {
    cacheState.getCachedForModels.mockReturnValueOnce("Cached from a different model");
    state.filterContent.mockReset();
    state.filterContent.mockResolvedValueOnce({
      filtered: "Fresh answer from the effective model.",
      model: "anthropic-cc/claude-haiku-4-5",
    });

    const previousFilterModel = configState.value.filterModel;
    configState.value.filterModel = undefined;
    try {
      const { fetchContentTool } = await getFetchContentTool();
      const ctx = {
        modelRegistry: { find: vi.fn(), getApiKeyAndHeaders: vi.fn() },
      } as any;

      const result = await fetchContentTool.execute(
        "call-auto-detect-cache-skip",
        { url: "https://docs.example.com/api", prompt: "What is the rate limit?" },
        undefined,
        undefined,
        ctx
      );

      expect(cacheState.getCachedForModels).not.toHaveBeenCalled();
      expect(state.extractContent).toHaveBeenCalled();
      expect(state.filterContent).toHaveBeenCalledWith(
        "RAW PAGE CONTENT",
        "What is the rate limit?",
        ctx.modelRegistry,
        undefined,
        expect.any(Function),
        undefined
      );
      expect(cacheState.putCache).toHaveBeenCalledWith(
        "https://docs.example.com/api",
        "What is the rate limit?",
        "anthropic-cc/claude-haiku-4-5",
        "Fresh answer from the effective model.",
        1440,
        expect.any(String)
      );
      expect(getText(result)).toContain("Fresh answer from the effective model.");
      expect(getText(result)).not.toContain("Cached from a different model");
    } finally {
      configState.value.filterModel = previousFilterModel;
    }
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "skips cache read in auto-detect mode"`
Expected: FAIL — `AssertionError: expected "spy" to not be called at all, but actually been called 1 times`

**Step 3 — Write minimal implementation**
In `index.ts`, change the single-URL early cache check so it only runs when a configured model is present.

Replace the existing single-URL early cache block with:

```ts
        // Early cache check for single-URL + prompt is safe only when the effective model is configured.
        // In auto-detect mode, resolve/filter first so stale answers from another candidate are not reused.
        if (dedupedUrls.length === 1 && prompt && !noCache) {
          const config = getConfig();
          if (config.filterModel) {
            const cachedAnswer = getCachedForModels(dedupedUrls[0], prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
            if (cachedAnswer !== null) {
              const responseId = generateId();
              return {
                content: [{ type: "text", text: `Source: ${dedupedUrls[0]}\n\n${cachedAnswer}` }],
                details: {
                  responseId,
                  url: dedupedUrls[0],
                  charCount: cachedAnswer.length,
                  filtered: true,
                  cached: true,
                  ptcValue: { responseId, urls: [{ url: dedupedUrls[0], title: null, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null }], successCount: 1, totalCount: 1 },
                },
              };
            }
          }
        }
```

Also change the multi-URL prompt cache guard from:

```ts
                if (!noCache) {
                  const cachedAnswer = getCachedForModels(r.url, prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
```

 to:

```ts
                if (!noCache && config.filterModel) {
                  const cachedAnswer = getCachedForModels(r.url, prompt, getFilterModelKeys(config.filterModel), config.cacheTTLMinutes, DEFAULT_CACHE_FILE);
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "skips cache read in auto-detect mode"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 3: Expose configured filterModel on cache hits [depends: 2]

Covers AC 4, AC 5, AC 9, AC 10, AC 12.

**Files:**
- Modify: `index.test.ts`
- Modify: `index.ts`

**Step 1 — Write the failing test**
In `index.test.ts`, inside `describe("fetch_content research cache integration", ...)`, add this test after `returns cached answer on cache hit without calling extractContent or filterContent`:

```ts
  it("returns configured-model cache hit with filterModel detail", async () => {
    cacheState.getCachedForModels.mockReturnValueOnce("Cached answer from configured model.");

    const previousFilterModel = configState.value.filterModel;
    configState.value.filterModel = "openai-codex/gpt-5.4-mini";
    try {
      const { fetchContentTool } = await getFetchContentTool();
      const ctx = {
        modelRegistry: { find: vi.fn(), getApiKeyAndHeaders: vi.fn() },
      } as any;

      const result = await fetchContentTool.execute(
        "call-configured-cache-hit",
        { url: "https://docs.example.com/api", prompt: "What is the rate limit?" },
        undefined,
        undefined,
        ctx
      );

      expect(cacheState.getCachedForModels).toHaveBeenCalledWith(
        "https://docs.example.com/api",
        "What is the rate limit?",
        ["openai-codex/gpt-5.4-mini"],
        1440,
        expect.any(String)
      );
      expect(state.extractContent).not.toHaveBeenCalled();
      expect(state.filterContent).not.toHaveBeenCalled();
      expect(result.details.cached).toBe(true);
      expect(result.details.filterModel).toBe("openai-codex/gpt-5.4-mini");
      expect(getText(result)).toContain("Cached answer from configured model.");
    } finally {
      configState.value.filterModel = previousFilterModel;
    }
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "returns configured-model cache hit with filterModel detail"`
Expected: FAIL — `AssertionError: expected undefined to be 'openai-codex/gpt-5.4-mini'`

**Step 3 — Write minimal implementation**
If Task 2 was implemented exactly as written, the single-URL cached-hit `details` object in `index.ts` already includes:

```ts
                  filterModel: config.filterModel,
```

If it does not, add that property to the cached-hit return details immediately after `cached: true`:

```ts
                details: {
                  responseId,
                  url: dedupedUrls[0],
                  charCount: cachedAnswer.length,
                  filtered: true,
                  cached: true,
                  filterModel: config.filterModel,
                  ptcValue: { responseId, urls: [{ url: dedupedUrls[0], title: null, content: null, filtered: cachedAnswer, filePath: null, charCount: cachedAnswer.length, error: null }], successCount: 1, totalCount: 1 },
                },
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "returns configured-model cache hit with filterModel detail"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 4: Document filterModel auto-detection behavior [no-test] [depends: 1]

Covers AC 11 and preserves the out-of-scope decision not to introduce `summarizationModel`.

**Justification:** Documentation-only change. The observable runtime behavior is covered by Tasks 1–3 and existing filter/config tests.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**
In the `README.md` Configuration section, update the `filterModel` config option row from:

```md
| `filterModel` | Cheap model used by `fetch_content({ prompt })` |
```

to:

```md
| `filterModel` | Summarization/filter model used by `fetch_content({ prompt })`, in `provider/model-id` format |
```

Then add this paragraph immediately after the config options table:

```md
Omit `filterModel` to let pi-web-tools auto-detect an available cheap filter model from its built-in candidate list. The config field is intentionally named `filterModel`; there is no separate `summarizationModel` setting.
```

**Step 2 — Verify**
Run: `npm run build`
Expected: TypeScript build succeeds and README now documents `filterModel`, the `provider/model-id` format, and omit-to-auto-detect behavior.

### Task 5: Regenerate built distribution output [no-test] [depends: 1, 2, 3]

Keeps packaged `dist/` output consistent with source changes from Tasks 1–3.

**Justification:** Generated build-output update. Runtime behavior is tested in Tasks 1–3; this task ensures published JavaScript matches TypeScript source.

**Files:**
- Modify: `dist/config.js`
- Modify: `dist/config.d.ts`
- Modify: `dist/index.js`
- Modify: `dist/index.d.ts`

**Step 1 — Make the change**
Run the project build so TypeScript regenerates `dist/` from source:

```bash
npm run build
```

Do not hand-edit generated `dist/` files.

**Step 2 — Verify**
Run: `npm test`
Expected: all passing

### Task 6: Reject malformed configured model before registry lookup [depends: 1]

Covers AC 7 and AC 12.

**Files:**
- Modify: `filter.test.ts`
- Modify: `filter.ts`

**Step 1 — Write the failing test**
In `filter.test.ts`, inside `describe("resolveFilterModel", ...)`, add this test after `returns no-model when getApiKeyAndHeaders returns ok:false`:

```ts
  it("returns malformed-config failure without registry lookup for invalid configured filterModel", async () => {
    const mockRegistry = {
      find: vi.fn(),
      getApiKeyAndHeaders: vi.fn(),
    };

    const result = await resolveFilterModel(mockRegistry as any, "provider/");

    expect(result).toEqual({
      model: null,
      reason: 'Configured filterModel "provider/" is malformed (expected provider/model-id)',
    });
    expect(mockRegistry.find).not.toHaveBeenCalled();
    expect(mockRegistry.getApiKeyAndHeaders).not.toHaveBeenCalled();
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run filter.test.ts -t "malformed-config failure"`
Expected: FAIL — `AssertionError: expected { model: null, …(1) } to deeply equal { model: null, …(1) }` with diff showing received reason `Configured filterModel "provider/" not available (no model or API key)`.

**Step 3 — Write minimal implementation**
In `filter.ts`, inside `resolveFilterModel`, replace the configured-model parsing branch:

```ts
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (provider && modelId) {
      const model = registry.find(provider, modelId);
      if (model) {
        const auth = await tryResolve(registry, model);
        if (auth) {
          return { model, apiKey: auth.apiKey, headers: auth.headers };
        }
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }
```

with:

```ts
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (!provider || !modelId) {
      return { model: null, reason: `Configured filterModel "${configuredModel}" is malformed (expected provider/model-id)` };
    }

    const model = registry.find(provider, modelId);
    if (model) {
      const auth = await tryResolve(registry, model);
      if (auth) {
        return { model, apiKey: auth.apiKey, headers: auth.headers };
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run filter.test.ts -t "malformed-config failure"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
