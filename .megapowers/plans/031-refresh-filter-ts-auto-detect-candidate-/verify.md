## Test Suite Results

Project conventions: no `AGENTS.md` found (`find AGENTS.md` returned no files), so verification used the existing npm/Vitest commands.

Full suite run:

```text
$ npm test

> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ commands.test.ts (11 tests) 7ms
 ✓ github-extract.clone.test.ts (4 tests) 67ms
 ✓ session-results-store.test.ts (6 tests) 8ms
 ✓ exa-context.test.ts (9 tests) 8ms
 ✓ offload.test.ts (9 tests) 10ms
 ✓ config.test.ts (18 tests) 20ms
 ✓ retry.test.ts (14 tests) 26ms
 ✓ research-cache.test.ts (29 tests) 32ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 3ms
 ✓ extract.test.ts (17 tests) 70ms
 ✓ scope-rescope.test.ts (3 tests) 13ms
 ✓ filter.test.ts (13 tests) 5ms
 ✓ storage.test.ts (8 tests) 5ms
 ✓ exa-search.test.ts (37 tests) 15ms
 ✓ smart-search.test.ts (11 tests) 5ms
 ✓ tool-params.test.ts (36 tests) 5ms
 ✓ smart-search.integration.test.ts (1 test) 478ms
 ✓ cli.code.test.ts (2 tests) 6ms
 ✓ cli.fetch.raw.test.ts (2 tests) 5ms
 ✓ truncation.test.ts (7 tests) 8ms
 ✓ github-extract.test.ts (9 tests) 5ms
 ✓ cli.search.test.ts (2 tests) 6ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 6ms
 ✓ ptc-value.test.ts (16 tests) 970ms
 ✓ dependencies.test.ts (2 tests) 4ms
 ✓ cli.usage.test.ts (2 tests) 4ms
 ✓ index.test.ts (78 tests) 1560ms

 Test Files  27 passed (27)
      Tests  349 passed (349)
   Duration  2.06s
```

Focused regression/symptom reproduction run:

```text
$ npx vitest run filter.test.ts

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ filter.test.ts (13 tests) 5ms

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  323ms
```

Impact check on changed symbols:

```text
$ impact(resolveFilterModel, filterContent)
No dependents found for 'resolveFilterModel' within depth 5.
No dependents found — 'filterContent' is an entry point with no callers.
```

Execution path check from real entry point:

```text
$ trace(filterContent)
mode: static (heuristic, no runtime evidence)
filter.ts  88:44a  filterContent  function [entry-point, untested]
filter.ts  55:d10  resolveFilterModel  function [untested]
filter.ts  44:8c2  tryResolve  function [leaf, untested]
```

Symbol/source evidence:

```text
resolveFilterModel signature: (registry: ModelRegistry, configuredModel?: string) => Promise<FilterModelResult>
filterContent signature: (content: string, prompt: string, registry: ModelRegistry, configuredModel: string | undefined, completeFn: CompleteFn, signal?: AbortSignal) => Promise<FilterResult>
```

## Per-Criterion Verification

### Criterion 1: `AUTO_DETECT_MODELS` contains exactly the requested candidates in order.
**Evidence:** `ast_search` and anchored source show:

```text
filter.ts:21 const AUTO_DETECT_MODELS = [
filter.ts:22   { provider: "anthropic-cc", modelId: "claude-haiku-4-5" },
filter.ts:23   { provider: "openai-codex", modelId: "gpt-5.4-mini" },
filter.ts:24   { provider: "xiaomi", modelId: "mimo-v2.5-pro" },
filter.ts:25 ] as const;
```

**Verdict:** pass

### Criterion 2: `resolveFilterModel(registry, undefined)` attempts candidates in declared order.
**Evidence:** Implementation iterates `AUTO_DETECT_MODELS` and calls `registry.find(candidate.provider, candidate.modelId)`:

```text
filter.ts:75 // 2. Auto-detect: try each candidate
filter.ts:76 for (const candidate of AUTO_DETECT_MODELS) {
filter.ts:77   const model = registry.find(candidate.provider, candidate.modelId);
```

Regression tests assert call order:

```text
filter.test.ts:87 expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
filter.test.ts:97 expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
filter.test.ts:98 expect(mockRegistry.find).toHaveBeenNthCalledWith(2, second.provider, second.modelId);
filter.test.ts:108 expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
filter.test.ts:109 expect(mockRegistry.find).toHaveBeenNthCalledWith(2, second.provider, second.modelId);
filter.test.ts:110 expect(mockRegistry.find).toHaveBeenNthCalledWith(3, third.provider, third.modelId);
```

`npx vitest run filter.test.ts` passed: 13 tests passed.

**Verdict:** pass

### Criterion 3: First available/authenticated candidate returns `anthropic-cc/claude-haiku-4-5`.
**Evidence:** Test uses the first candidate from the shared table and expects that model:

```text
filter.test.ts:81 it("auto-detects the first candidate when no config and credentials resolve ok:true", async () => {
filter.test.ts:82   const [first] = AUTO_DETECT_CANDIDATES;
filter.test.ts:85   const result = await resolveFilterModel(mockRegistry as any, undefined);
filter.test.ts:88   expect(result).toEqual({ model: candidateModel(first), apiKey: `${first.provider}-key`, headers: undefined });
```

Shared table lines 5-9 define first as `anthropic-cc/claude-haiku-4-5`. Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 4: Fallback to second candidate returns `openai-codex/gpt-5.4-mini`.
**Evidence:** Test authenticates only the second candidate and expects it:

```text
filter.test.ts:91 it("falls back to the second candidate when the first candidate auth fails", async () => {
filter.test.ts:92   const [first, second] = AUTO_DETECT_CANDIDATES;
filter.test.ts:93   const mockRegistry = createAutoDetectRegistry({ authenticated: [second] });
filter.test.ts:97   expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
filter.test.ts:98   expect(mockRegistry.find).toHaveBeenNthCalledWith(2, second.provider, second.modelId);
filter.test.ts:99   expect(result).toEqual({ model: candidateModel(second), apiKey: `${second.provider}-key`, headers: undefined });
```

Shared table lines 5-9 define second as `openai-codex/gpt-5.4-mini`. Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 5: Fallback to third candidate returns `xiaomi/mimo-v2.5-pro`.
**Evidence:** Test authenticates only the third candidate and expects it:

```text
filter.test.ts:102 it("falls back to the third candidate when earlier candidates auth fail", async () => {
filter.test.ts:103   const [first, second, third] = AUTO_DETECT_CANDIDATES;
filter.test.ts:104   const mockRegistry = createAutoDetectRegistry({ authenticated: [third] });
filter.test.ts:108-110 expect calls 1, 2, and 3 in order
filter.test.ts:111 expect(result).toEqual({ model: candidateModel(third), apiKey: `${third.provider}-key`, headers: undefined });
```

Shared table lines 5-9 define third as `xiaomi/mimo-v2.5-pro`. Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 6: No candidate with credentials returns failure reason listing all candidates in order.
**Evidence:** Code builds the reason from `AUTO_DETECT_MODELS`:

```text
filter.ts:85 return { model: null, reason: `No filter model available (tried ${AUTO_DETECT_MODELS.map(m => `${m.provider}/${m.modelId}`).join(", ")})` };
```

Test asserts exact ordered string:

```text
filter.test.ts:114 it("returns no-model when none of the auto-detect candidates has credentials", async () => {
filter.test.ts:121 reason: "No filter model available (tried anthropic-cc/claude-haiku-4-5, openai-codex/gpt-5.4-mini, xiaomi/mimo-v2.5-pro)",
```

Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 7: Configured arbitrary `provider/modelId` resolves through `registry.find` outside auto-detect list.
**Evidence:** Code configured path parses the supplied string and calls `registry.find(provider, modelId)` before auto-detect:

```text
filter.ts:60 if (configuredModel) {
filter.ts:61   const [provider, ...idParts] = configuredModel.split("/");
filter.ts:62   const modelId = idParts.join("/");
filter.ts:64   const model = registry.find(provider, modelId);
```

Test uses `custom-provider/custom-model`, not in `AUTO_DETECT_CANDIDATES`, and asserts the find call:

```text
filter.test.ts:43 const result = await resolveFilterModel(mockRegistry as any, "custom-provider/custom-model");
filter.test.ts:44 expect(result).toEqual({ model: mockModel, apiKey: "test-key", headers: undefined });
filter.test.ts:45 expect(mockRegistry.find).toHaveBeenCalledWith("custom-provider", "custom-model");
```

Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 8: Configured unavailable/lacking credentials returns existing failure shape naming configured model.
**Evidence:** Code return shape:

```text
filter.ts:72 return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
```

Test asserts exact shape:

```text
filter.test.ts:74 const result = await resolveFilterModel(mockRegistry as any, "custom-provider/custom-model");
filter.test.ts:75-78 expect(result).toEqual({ model: null, reason: 'Configured filterModel "custom-provider/custom-model" not available (no model or API key)' });
```

Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 9: `resolveFilterModel` continues to use `ModelRegistry.getApiKeyAndHeaders`.
**Evidence:** `resolveFilterModel` calls `tryResolve`, and `tryResolve` calls `getApiKeyAndHeaders`:

```text
filter.ts:48 const auth = await (registry as unknown as RegistryWithAuthHeaders).getApiKeyAndHeaders(model as Model<Api>);
filter.ts:66 const auth = await tryResolve(registry, model);
filter.ts:79 const auth = await tryResolve(registry, model);
```

Tests exercise `getApiKeyAndHeaders` success and failure via registry mocks in `filter.test.ts` lines 40, 52, 71, 141, 172, and 194. Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 10: Successful model resolution includes custom auth headers.
**Evidence:** `tryResolve` returns headers and `resolveFilterModel` includes them:

```text
filter.ts:50 return { apiKey: auth.apiKey, headers: auth.headers };
filter.ts:68 return { model, apiKey: auth.apiKey, headers: auth.headers };
filter.ts:81 return { model, apiKey: auth.apiKey, headers: auth.headers };
```

Test asserts headers on `resolveFilterModel`:

```text
filter.test.ts:48 it("threads headers from ok:true response", async () => {
filter.test.ts:55 headers: { "anthropic-beta": "oauth-2025-04-20" },
filter.test.ts:60-64 expect(result).toEqual({ model: mockModel, apiKey: "oauth-key", headers: { "anthropic-beta": "oauth-2025-04-20" } });
```

Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 11: `filterContent` passes resolved `apiKey`, `headers`, and `signal` through to `completeFn`.
**Evidence:** Code passes all three values:

```text
filter.ts:101 const { model, apiKey, headers } = resolved as ...
filter.ts:118 const response = await completeFn(model, context, { apiKey, headers, signal });
```

Test asserts apiKey, headers, and signal:

```text
filter.test.ts:161 const [model, context, options] = mockComplete.mock.calls[0];
filter.test.ts:163 expect(options.apiKey).toBe("test-key");
filter.test.ts:164 expect(options.headers).toBeUndefined();
filter.test.ts:165 expect(options.signal).toBe(signal);
```

Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 12: `filterContent` returns fallback without calling `completeFn` when model resolution fails.
**Evidence:** Code returns before `completeFn` if no resolved model:

```text
filter.ts:96 const resolved = await resolveFilterModel(registry, configuredModel);
filter.ts:97 if (!resolved.model) {
filter.ts:98   return { filtered: null, reason: resolved.reason };
filter.ts:118 const response = await completeFn(...);
```

Test asserts exact fallback and no call:

```text
filter.test.ts:191 it("returns fallback reason without calling completeFn when filter model resolution fails", async () => {
filter.test.ts:206-209 expect(result).toEqual({ filtered: null, reason: 'Configured filterModel "anthropic-cc/claude-haiku-4-5" not available (no model or API key)' });
filter.test.ts:210 expect(mockComplete).not.toHaveBeenCalled();
```

Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 13: `filter.test.ts` covers auto-detect candidate list from a single candidate-list source/table.
**Evidence:** Single source table and helpers:

```text
filter.test.ts:5 const AUTO_DETECT_CANDIDATES = [
filter.test.ts:6   { provider: "anthropic-cc", modelId: "claude-haiku-4-5" },
filter.test.ts:7   { provider: "openai-codex", modelId: "gpt-5.4-mini" },
filter.test.ts:8   { provider: "xiaomi", modelId: "mimo-v2.5-pro" },
filter.test.ts:13 function candidateModel(candidate: Candidate) { ... }
filter.test.ts:17 function createAutoDetectRegistry(...) { ... }
filter.test.ts:21 const available = options.available ?? AUTO_DETECT_CANDIDATES;
```

Ordering assertions derive from destructuring that table at lines 82, 92, and 103. Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 14: `filter.test.ts` includes fallback coverage from first to second and earlier to third.
**Evidence:** Dedicated tests exist:

```text
filter.test.ts:91 it("falls back to the second candidate when the first candidate auth fails", async () => { ... });
filter.test.ts:102 it("falls back to the third candidate when earlier candidates auth fail", async () => { ... });
```

Focused test run passed: 13 tests passed.

**Verdict:** pass

### Criterion 15: README default-filter-model references are updated to `anthropic-cc/claude-haiku-4-5`.
**Evidence:** README config example:

```text
README.md:333 ### Full config example
README.md:334 {
README.md:335   "exaApiKey": "your-exa-key",
README.md:336   "filterModel": "anthropic-cc/claude-haiku-4-5",
```

README stale-reference check:

```text
$ grep literal "anthropic/claude-haiku-4-5" README.md
[0 matches in 0 files]
```

**Verdict:** pass

### Criterion 16: `config.ts` behavior remains unchanged unless stale default-model documentation is found there.
**Evidence:** `config.ts` still defaults `filterModel` to `undefined`:

```text
config.ts:28 const DEFAULT_CONFIG: WebToolsConfig = {
config.ts:29   exaApiKey: null,
config.ts:30   filterModel: undefined,
```

`git diff -- config.ts filter.ts filter.test.ts README.md` showed changes only in `README.md`, `filter.test.ts`, and `filter.ts`; no `config.ts` diff was reported. Full suite also passed, including `config.test.ts` (18 tests).

**Verdict:** pass

## Bugfix Symptom Reproduction

Original symptom: unconfigured filter auto-detect tried the stale first candidate (`anthropic/claude-haiku-4-5`) instead of `anthropic-cc/claude-haiku-4-5`.

Current reproduction evidence: the focused regression test suite passed after asserting the first call is the new candidate:

```text
filter.test.ts:87 expect(mockRegistry.find).toHaveBeenNthCalledWith(1, first.provider, first.modelId);
filter.test.ts:5-9 first candidate = anthropic-cc/claude-haiku-4-5

$ npx vitest run filter.test.ts
Test Files  1 passed (1)
Tests       13 passed (13)
```

The symptom no longer occurs in the regression path.

## Overall Verdict

pass

All 16 acceptance criteria are verified with anchored source inspection and fresh test output. The full suite passed (`27 passed`, `349 passed`), the focused filter regression suite passed (`13 passed`), and README/config verification confirms documentation was updated without changing `config.ts` behavior.
