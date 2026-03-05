# Verification Report — 012-haiku-filter-on-fetch-content

## Test Suite Results

```
> @coctostan/pi-exa-gh-web-tools@1.2.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ exa-search.test.ts (18 tests) 5ms
 ✓ truncation.test.ts (7 tests) 2ms
 ✓ filter.test.ts (9 tests) 3ms
 ✓ exa-context.test.ts (7 tests) 3ms
 ✓ offload.test.ts (8 tests) 6ms
 ✓ tool-params.test.ts (22 tests) 3ms
 ✓ storage.test.ts (7 tests) 3ms
 ✓ github-extract.test.ts (9 tests) 2ms
 ✓ config.test.ts (15 tests) 11ms
 ✓ github-extract.clone.test.ts (4 tests) 36ms
 ✓ index.test.ts (3 tests) 253ms
 ✓ extract.test.ts (14 tests) 75ms

 Test Files  12 passed (12)
      Tests  123 passed (123)
   Start at  18:24:48
   Duration  621ms
```

---

## Per-Criterion Verification

### Criterion 1: `fetch_content` tool schema accepts an optional `prompt` string parameter
**Evidence:** `index.ts` line 96:
```ts
prompt: Type.Optional(Type.String({ description: "Question to answer from the fetched content. When provided, content is filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page)." })),
```
**Verdict:** pass

---

### Criterion 2: When `prompt` is provided with a single URL, the extracted page content is sent to a cheap model with the prompt as the user's question
**Evidence:**  
- `index.ts` lines 377–385: `if (prompt) { ... filterContent(r.content, prompt, ctx.modelRegistry, config.filterModel, complete) }`
- `filter.ts` line 84: user message is `\`<page_content>\n${content}\n</page_content>\n\nQuestion: ${prompt}\``
- `index.test.ts` lines 115–121: asserts `filterContent` was called with `"RAW PAGE"`, `"What is the rate limit?"`, `ctx.modelRegistry`, `undefined`, and a function.

**Verdict:** pass

---

### Criterion 3: The filter model receives a system prompt instructing it to answer using ONLY the provided content, preserve code snippets verbatim, and state when the content doesn't answer the question
**Evidence:** `filter.ts` lines 21–28:
```
"Answer using ONLY information found in the provided content"
"Include relevant code snippets verbatim — do not paraphrase or modify code"
"If the content does not answer the question, say "The provided content does not contain information about [topic].""
```
`filter.test.ts` line 109: `expect(context.systemPrompt).toContain("ONLY")`

**Verdict:** pass

---

### Criterion 4: When filtering succeeds, the tool returns `"Source: <url>\n\n<filtered answer>"` instead of the full page content
**Evidence:**  
- `index.ts` line 389: `text: \`Source: ${r.url}\n\n${filterResult.filtered}\``
- `index.test.ts` line 123: `expect(getText(filteredResult)).toBe("Source: https://example.com/docs\n\n100 requests/minute.")`

**Verdict:** pass

---

### Criterion 5: `web-tools.json` supports an optional `filterModel` field in `"provider/model-id"` format
**Evidence:**  
- `config.ts` line 22: `filterModel?: string;` in `WebToolsConfig` interface
- `config.ts` lines 92–94: parsed from file only when value is a string containing `/`:
  ```ts
  const filterModel = typeof file["filterModel"] === "string" && file["filterModel"].includes("/")
    ? file["filterModel"]
    : undefined;
  ```
- `config.ts` line 111: included in returned config object.

**Verdict:** pass

---

### Criterion 6: When `filterModel` is configured, that model is used for filtering
**Evidence:**  
- `filter.ts` lines 36–49: first branch uses `configuredModel` via `registry.find(provider, modelId)` and `registry.getApiKey(model)`
- `index.ts` line 383: passes `config.filterModel` as the `configuredModel` argument
- `filter.test.ts` lines 5–15: `resolveFilterModel` with `"anthropic/claude-haiku-4-5"` config calls `find("anthropic", "claude-haiku-4-5")` and returns `{ model, apiKey }`.

**Verdict:** pass

---

### Criterion 7: When `filterModel` is not configured, the filter auto-detects: try `anthropic/claude-haiku-4-5` → `openai/gpt-4o-mini` → fallback to raw content
**Evidence:**  
- `filter.ts` lines 10–13:
  ```ts
  const AUTO_DETECT_MODELS = [
    { provider: "anthropic", modelId: "claude-haiku-4-5" },
    { provider: "openai", modelId: "gpt-4o-mini" },
  ]
  ```
- `filter.ts` lines 52–61: iterates candidates in order, stops at first with API key
- `filter.test.ts` lines 32–45: test "falls back to GPT-4o-mini when Haiku is unavailable" passes
- `filter.test.ts` lines 47–55: test "returns no-model when neither is available" passes

**Verdict:** pass

---

### Criterion 8: Auto-detection uses `ctx.modelRegistry.find(provider, modelId)` and `ctx.modelRegistry.getApiKey(model)` to check availability
**Evidence:**  
- `filter.ts` lines 40–42 (configured path): `registry.find(provider, modelId)` → `registry.getApiKey(model)`
- `filter.ts` lines 53–55 (auto-detect path): same calls
- `filter.test.ts` lines 8–9: mock registry with `find` and `getApiKey`, assertions verify both are called with correct args (e.g. line 14: `expect(mockRegistry.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5")`)

**Verdict:** pass

---

### Criterion 9: When no filter model is available (no API key), the tool returns raw content with a warning: `"⚠ No filter model available. Returning raw content."`
**Evidence:**  
- `filter.ts` line 61: returns `{ model: null, reason: "No filter model available (tried ...)" }`
- `index.ts` lines 401–405:
  ```ts
  const reason = filterResult.reason.startsWith("No filter model available")
    ? "No filter model available. Returning raw content."
    : filterResult.reason;
  let text = `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}`;
  ```
- `index.test.ts` lines 133–135: `expect(getText(noModelFallback)).toBe("⚠ No filter model available. Returning raw content.\n\n# Docs\n\nRAW PAGE")`

**Verdict:** pass

---

### Criterion 10: When the filter model API call fails (network error, rate limit, model error), the tool returns raw content with a warning including the error message
**Evidence:**  
- `filter.ts` lines 98–100: `catch (err)` returns `{ filtered: null, reason: \`Filter model error: ${msg}\` }`
- `index.ts` lines 401–405: reason doesn't match "No filter model available", so passed through verbatim; prepended with `⚠`
- `index.test.ts` line 145: `expect(getText(modelErrorFallback)).toContain("⚠ Filter model error: Rate limit exceeded")`

**Verdict:** pass

---

### Criterion 11: When the filter model returns an empty or very short response (< 20 chars), the tool returns raw content with a warning
**Evidence:**  
- `filter.ts` line 30: `const MIN_FILTER_RESPONSE_LENGTH = 20;`
- `filter.ts` lines 94–96: `if (answer.length < MIN_FILTER_RESPONSE_LENGTH) { return { filtered: null, reason: \`Filter response too short (${answer.length} chars)\` }; }`
- `filter.test.ts` lines 132–151: "OK" (2 chars) → `{ filtered: null, reason: "Filter response too short (2 chars)" }` — passes
- `filter.test.ts` lines 154–174: empty content array → `{ filtered: null, reason: "Filter response too short (0 chars)" }` — passes

**Verdict:** pass

---

### Criterion 12: When `prompt` is provided with multiple URLs, each URL's content is filtered through the cheap model in parallel using `p-limit(3)`
**Evidence:**  
- `index.ts` line 450: `const limit = pLimit(3);`
- `index.ts` lines 451–477: `Promise.all(results.map((r) => limit(async () => { ... filterContent(...) })))`
- `index.test.ts` line 212: `expect(pLimitState.pLimitSpy).toHaveBeenCalledWith(3)`
- `index.test.ts` line 213: `expect(state.filterContent).toHaveBeenCalledTimes(3)`
- `index.test.ts` lines 222–226: assertions confirm filtered and fallback blocks both present in output

**Verdict:** pass

---

### Criterion 13: When `prompt` is not provided, `fetch_content` behaves identically to current behavior (no regression)
**Evidence:**  
- `index.ts` lines 426–445 (single URL, no prompt): skips filter block entirely, returns `# ${r.title}\n\n${r.content}`
- `index.ts` lines 491–515 (multi-URL, no prompt): returns summary listing with `✅`/`❌` per URL and `get_search_content` hint
- `index.test.ts` lines 147–158: asserts `filterContent` not called and raw text is `"# Docs\n\nRAW PAGE"`
- `index.test.ts` lines 229–272: multi-URL without prompt — asserts `filterContent` not called, text contains `"Fetched 2/3 URLs. Response ID:"`, `"1. ✅ A Docs (5 chars)"`, etc.

**Verdict:** pass

---

### Criterion 14: The `fetch_content` tool description includes guidance nudging the agent to use the `prompt` parameter for focused answers
**Evidence:** `index.ts` lines 323–324:
```ts
description:
  "Fetch URL(s) and extract readable content as markdown. Supports GitHub repository contents (clone + tree). Content is stored and can be retrieved with get_search_content if truncated.\n\nFor focused answers, use the `prompt` parameter with a specific question — the content will be filtered through a cheap model and only the relevant answer returned (~200-1000 chars instead of full page content).",
```

**Verdict:** pass

---

### Criterion 15: The filter logic lives in a separate `filter.ts` module exporting a `filterContent` function
**Evidence:**  
- File `filter.ts` exists (3789 bytes, modified Mar 4 18:16)
- `filter.ts` line 64: `export async function filterContent(...)`
- `index.ts` line 11: `import { filterContent } from "./filter.js";`

**Verdict:** pass

---

### Criterion 16: `filterContent` returns `{ filtered: string, model: string }` on success or `{ filtered: null, reason: string }` on fallback
**Evidence:** `filter.ts` lines 17–19:
```ts
export type FilterResult =
  | { filtered: string; model: string }
  | { filtered: null; reason: string };
```
Return sites:
- Success: line 97 — `return { filtered: answer, model: \`${model.provider}/${model.id}\` };`
- No model: line 73 — `return { filtered: null, reason: resolved.reason };`
- Too short: line 95 — `return { filtered: null, reason: \`Filter response too short (${answer.length} chars)\` };`
- API error: line 100 — `return { filtered: null, reason: \`Filter model error: ${msg}\` };`

**Verdict:** pass

---

### Criterion 17: The `_ctx` parameter in `fetch_content`'s execute handler is activated (renamed from `_ctx` to `ctx`) to access `modelRegistry`
**Evidence:**  
- `index.ts` line 327: `async execute(_toolCallId, params, signal, _onUpdate, ctx) {`  
  (fifth parameter is `ctx`, not `_ctx`)
- `index.ts` lines 382, 461: `ctx.modelRegistry` used directly in both single-URL and multi-URL filter calls

**Verdict:** pass

---

## Overall Verdict

**pass**

All 17 acceptance criteria are satisfied. The test suite runs clean (123/123 tests pass across 12 files). Each criterion was verified independently via code inspection with specific line references and/or the test assertions that exercise the behavior directly.
