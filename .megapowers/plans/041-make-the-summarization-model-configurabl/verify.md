# Verification Report — 041 make the summarization model configurable

## Test Suite Results

Project convention check: `find AGENTS.md` returned no files, so commands were inferred from `package.json` behavior and prior task plan.

Fresh full suite command:

```bash
npm test
```

Output:

```text
> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ smart-search.test.ts (11 tests) 6ms
 ✓ filter.test.ts (14 tests) 5ms
 ✓ exa-context.test.ts (9 tests) 6ms
 ✓ exa-search.test.ts (37 tests) 11ms
 ✓ config.test.ts (19 tests) 15ms
 ✓ retry.test.ts (14 tests) 10ms
 ✓ offload.test.ts (9 tests) 10ms
 ✓ research-cache.test.ts (31 tests) 30ms
 ✓ github-extract.clone.test.ts (4 tests) 57ms
 ✓ extract.test.ts (17 tests) 29ms
 ✓ scope-rescope.test.ts (3 tests) 10ms
 ✓ session-results-store.test.ts (6 tests) 11ms
 ✓ storage.test.ts (8 tests) 5ms
 ✓ commands.test.ts (11 tests) 7ms
 ✓ smart-search.integration.test.ts (1 test) 397ms
 ✓ tool-params.test.ts (36 tests) 13ms
 ✓ cli.usage.test.ts (2 tests) 3ms
 ✓ cli.code.test.ts (2 tests) 5ms
 ✓ cli.search.test.ts (2 tests) 10ms
 ✓ cli.fetch.raw.test.ts (2 tests) 6ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 5ms
 ✓ ptc-value.test.ts (16 tests) 785ms
 ✓ github-extract.test.ts (9 tests) 5ms
 ✓ dependencies.test.ts (2 tests) 3ms
 ✓ truncation.test.ts (7 tests) 3ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 5ms
 ✓ index.test.ts (80 tests) 1234ms

 Test Files  27 passed (27)
      Tests  355 passed (355)
   Start at  15:16:46
   Duration  1.70s
```

Fresh build command:

```bash
npm run build
```

Output:

```text
✓ Build successful (0 units compiled)
```

Focused coverage command:

```bash
npx vitest run config.test.ts filter.test.ts index.test.ts -t "filterModel|cache|fallback|auto-detect"
```

Output:

```text
 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ filter.test.ts (14 tests | 6 skipped) 6ms
 ✓ config.test.ts (19 tests | 12 skipped) 10ms
 ✓ index.test.ts (80 tests | 65 skipped) 334ms

 Test Files  3 passed (3)
      Tests  30 passed | 83 skipped (113)
   Start at  15:17:33
   Duration  941ms
```

Impact check on changed primary symbols:

```text
impact(["getConfig","resolveFilterModel","filterContent","getFilterModelKeys"], behavior_change)
Trust: fresh
No dependents found — 'getConfig' is an entry point with no callers.
No dependents found for 'resolveFilterModel' within depth 4.
No dependents found — 'filterContent' is an entry point with no callers.
No dependents found — 'getFilterModelKeys' is an entry point with no callers.
```

Every directly changed test file surfaced by the implementation (`config.test.ts`, `filter.test.ts`, `index.test.ts`) ran in both the full suite and the focused command above.

Trace attempt from the feature entry point:

```text
trace(entry="fetchContentTool", file="index.ts")
Trust: fresh
Symbol "fetchContentTool" not found in the graph
```

Because the tool is registered inside the extension default export rather than as a named symbol in the trace graph, verification uses anchored source and structural AST evidence below to confirm the executed fetch_content path calls the changed config/filter/cache code.

## Bugfix Symptom Reproduction

The diagnosis did not provide external manual reproduction steps. The original symptoms were reproduced and verified gone by the regression tests:

- malformed `filterModel` config values are rejected: `config.test.ts:63-70`
- auto-detect mode does not reuse a stale cache hit from another model: `index.test.ts:1251-1297`
- malformed configured model returns before registry lookup: `filter.test.ts:81-95`

These ran in the focused command above and in the full suite: 30 focused tests passed, 355 full-suite tests passed.

## Symbol / Source Evidence

### `getConfig()` shape

```text
symbol_graph(getConfig, config.ts)
## getConfig (function)
config.ts  120:06e
Signature: () => WebToolsConfig
Callees: buildConfig
Source:
120:06e|export function getConfig(): WebToolsConfig {
121:ce1|  const now = Date.now();
122:9ab|  if (cachedConfig !== null && now - cacheTimestamp < CONFIG_TTL_MS) {
123:39e|    return cachedConfig;
124:b18|  }
125:49a|  cachedConfig = buildConfig();
126:155|  cacheTimestamp = now;
127:39e|  return cachedConfig;
128:b18|}
```

`buildConfig()` validates `filterModel`:

```text
config.ts:94:eeb|  const rawFilterModel = file["filterModel"];
config.ts:95:b12|  const filterModel = typeof rawFilterModel === "string" && /^[^/\s]+\/\S.*$/.test(rawFilterModel)
config.ts:96:9a4|    ? rawFilterModel
config.ts:97:690|    : undefined;
```

### `resolveFilterModel()` shape

```text
symbol_graph(resolveFilterModel, filter.ts)
Signature: (registry: ModelRegistry, configuredModel?: string) => Promise<FilterModelResult>
Callers: filterContent
Source:
59:d10|export async function resolveFilterModel(
60:948|  registry: ModelRegistry,
61:b2e|  configuredModel?: string
62:4d4|): Promise<FilterModelResult> {
63:ae3|  // 1. Try configured model
64:936|  if (configuredModel) {
65:6e2|    const [provider, ...idParts] = configuredModel.split("/");
66:cf7|    const modelId = idParts.join("/");
67:7dc|    if (!provider || !modelId) {
68:ec3|      return { model: null, reason: `Configured filterModel "${configuredModel}" is malformed (expected provider/model-id)` };
69:b18|    }
70:d05|
71:ad5|    const model = registry.find(provider, modelId);
72:e71|    if (model) {
73:255|      const auth = await tryResolve(registry, model);
74:efe|      if (auth) {
75:0c5|        return { model, apiKey: auth.apiKey, headers: auth.headers };
76:b18|      }
77:b18|    }
78:bf9|    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
79:b18|  }
81:6f7|  // 2. Auto-detect: try each candidate
82:42e|  for (const candidate of AUTO_DETECT_MODELS) {
83:d2f|    const model = registry.find(candidate.provider, candidate.modelId);
```

### `filterContent()` shape

```text
symbol_graph(filterContent, filter.ts)
Signature: (content: string, prompt: string, registry: ModelRegistry, configuredModel: string | undefined, completeFn: CompleteFn, signal?: AbortSignal) => Promise<FilterResult>
Callees: resolveFilterModel
Source excerpts:
102:518|  const resolved = await resolveFilterModel(registry, configuredModel);
103:f07|  if (!resolved.model) {
104:87a|    return { filtered: null, reason: resolved.reason };
124:7e7|    const response = await completeFn(model, context, { apiKey, headers, signal });
129:c4c|    if (answer.length < MIN_FILTER_RESPONSE_LENGTH) {
130:eb4|      return { filtered: null, reason: `Filter response too short (${answer.length} chars)` };
132:7b5|    return { filtered: answer, model: `${model.provider}/${model.id}` };
133:df2|  } catch (err) {
135:d90|    return { filtered: null, reason: `Filter model error: ${msg}` };
```

### Fetch path structural evidence

AST search confirms `fetch_content` calls `filterContent` with `config.filterModel`:

```text
ast_search: filterContent($A, $B, $C, config.filterModel, $$$REST)
index.ts:522-529
index.ts:672-679
```

AST search confirms cache reads use configured-model keys only where guarded by `config.filterModel`:

```text
ast_search: getCachedForModels($URL, $PROMPT, getFilterModelKeys($CONFIG.filterModel), $$$REST)
index.ts:475
index.ts:666
```

AST search confirms cache writes use the effective model returned by filtering:

```text
ast_search: putCache($URL, $PROMPT, $FILTER.model, $FILTER.filtered, $$$REST)
index.ts:533
index.ts:682
```

## Per-Criterion Verification

### Criterion 1: `getConfig()` reads an optional `filterModel` value from config path.

**Evidence:** `config.test.ts:49-53` writes `{ filterModel: "anthropic/claude-haiku-4-5" }`, calls `resetConfigCache(); const config = getConfig();`, and expects `config.filterModel` to equal that value. The full suite and focused command passed. Source reads `file["filterModel"]` at `config.ts:94`.

**Verdict:** pass.

### Criterion 2: `getConfig()` accepts `filterModel` only as `provider/model-id`; missing or malformed returns `undefined`.

**Evidence:** Source validation is `config.ts:94-97`, using `typeof rawFilterModel === "string" && /^[^/\s]+\/\S.*$/.test(rawFilterModel) ? rawFilterModel : undefined`. Tests cover missing and malformed values at `config.test.ts:56-70`; the focused and full suites passed.

**Verdict:** pass.

### Criterion 3: `filterModel` remains the only public config field; no `summarizationModel` alias/replacement.

**Evidence:** `grep("summarizationModel", glob="*.ts")` returned `0 matches in 0 files`. README explicitly states no separate setting at `README.md:364`. Config source reads only `file["filterModel"]` at `config.ts:94` for this behavior.

**Verdict:** pass.

### Criterion 4: `resolveFilterModel(registry, configuredModel)` attempts the configured `provider/model-id` first.

**Evidence:** Source configured branch precedes auto-detect at `filter.ts:63-83`, with `registry.find(provider, modelId)` at `filter.ts:71`. Test `filter.test.ts:36-46` calls `resolveFilterModel(..., "custom-provider/custom-model")` and expects `mockRegistry.find` called with `"custom-provider", "custom-model"`; full and focused suites passed.

**Verdict:** pass.

### Criterion 5: When configured model exists and auth is usable, `filterContent(...)` uses that model for `complete(...)`.

**Evidence:** `resolveFilterModel` returns `{ model, apiKey, headers }` after auth at `filter.ts:71-76`. `filterContent` passes that `model` to `completeFn` at `filter.ts:124` and returns model identity at `filter.ts:132`. Test `filter.test.ts:150-183` verifies `filterContent` calls `completeFn` with the resolved model/options and returns the expected filtered result; full and focused suites passed.

**Verdict:** pass.

### Criterion 6: With no configured `filterModel`, auto-detect candidate order from `AUTO_DETECT_MODELS` is preserved.

**Evidence:** `AUTO_DETECT_MODELS` order is `anthropic-cc/claude-haiku-4-5`, `openai-codex/gpt-5.4-mini`, `xiaomi/mimo-v2.5-pro` at `filter.ts:21-25`. `resolveFilterModel` iterates that array in order at `filter.ts:81-88`. Tests assert first/second/third candidate order at `filter.test.ts:97-128`; full and focused suites passed.

**Verdict:** pass.

### Criterion 7: Missing, malformed, unavailable, or auth-failed configured model returns structured failure instead of throwing/aborting.

**Evidence:** Malformed returns `{ model: null, reason: ...malformed... }` before registry lookup at `filter.ts:67-68`; unavailable/auth-failed returns `{ model: null, reason: ...not available... }` at `filter.ts:78`. Tests cover auth-failed unavailable at `filter.test.ts:67-79`, malformed/no lookup at `filter.test.ts:81-95`, and `filterContent` resolution failure at `filter.test.ts:207-227`; full and focused suites passed.

**Verdict:** pass.

### Criterion 8: Filtering failures return raw fetched content with warning rather than failing fetch.

**Evidence:** `filterContent` returns structured `filtered: null` reasons for no model, short response, and model errors at `filter.ts:102-135`. Fetch path converts a null filter result into warning/raw-content file-first response at `index.ts:548-589` for single URL and `index.ts:686-704` for multi URL. Test `index.test.ts:783-817` verifies a single-url prompt fallback response contains source, temp file path, and `Full content saved to`; filter failure tests at `filter.test.ts:229-269` cover model error and invalid/too-short responses. Full and focused suites passed.

**Verdict:** pass.

### Criterion 9: Prompt-filtered research-cache lookup/write paths key answers by effective filter model identity.

**Evidence:** Cache reads use `getFilterModelKeys(config.filterModel)` and are guarded by `config.filterModel` at `index.ts:472-491` and `index.ts:664-667`, preventing auto-detect reads before the effective model is known. Cache writes use `filterResult.model` at `index.ts:533` and `index.ts:682`. `getFilterModelKeys` returns `[configuredModel]` or auto-detect identities at `filter.ts:27-29`. Tests verify configured cache key/detail at `index.test.ts:1188-1245` and auto-detect cache-read skip/write-effective-model at `index.test.ts:1251-1297`; full and focused suites passed.

**Verdict:** pass.

### Criterion 10: Successful filtered `fetch_content({ prompt })` results expose selected filter model in `details.filterModel`.

**Evidence:** Successful filtered single-url response sets `filterModel: filterResult.model` at `index.ts:531-543`; configured-model cache hit sets `filterModel: config.filterModel` at `index.ts:480-486`. Test `index.test.ts:1215-1245` verifies configured-model cache hit `result.details.filterModel`; existing successful filtered result tests ran in `index.test.ts` under the full suite.

**Verdict:** pass.

### Criterion 11: README docs show `filterModel`, explain use by `fetch_content({ prompt })`, show format, and state omit preserves auto-detection.

**Evidence:** README config table line `README.md:357` says `filterModel` is the summarization/filter model used by `fetch_content({ prompt })`, in `provider/model-id` format. `README.md:364` says omitting `filterModel` preserves auto-detection and there is no separate `summarizationModel`. Build passed after docs change.

**Verdict:** pass.

### Criterion 12: Automated tests cover configured config loading, missing/malformed config, configured selection, default auto-detection, unavailable configured fallback, filter failure raw-content fallback, successful detail `filterModel`, and cache separation by model.

**Evidence:**

- config loading: `config.test.ts:49-53`
- missing/malformed config: `config.test.ts:56-70`
- configured model selection: `filter.test.ts:36-46`
- default auto-detection/order: `filter.test.ts:97-128`
- unavailable configured fallback: `filter.test.ts:67-79`, `filter.test.ts:207-227`
- malformed configured fallback/no lookup: `filter.test.ts:81-95`
- filter failure fallback: `filter.test.ts:229-269`, raw-content fetch fallback at `index.test.ts:783-817`
- successful/cache result detail `filterModel`: `index.test.ts:1215-1245`, successful filtered source at `index.ts:531-543`
- cache separation by model: `index.test.ts:1188-1245`, `index.test.ts:1251-1297`

The focused command passed 30 relevant tests and the full suite passed 355 tests.

**Verdict:** pass.

## Distribution Output Verification

`npm run build` passed. Generated distribution files reflect source behavior:

- `dist/config.js:67-70` contains the `filterModel` regex validation.
- `dist/filter.js:25-40` contains malformed-config rejection and configured registry lookup.
- `dist/index.js:415-429` contains configured-model-only cache hit and `filterModel` detail.
- `dist/index.js:464-477` contains filtering with `config.filterModel`, cache write by `filterResult.model`, and successful detail `filterModel`.

## Overall Verdict

pass

All 12 acceptance criteria are backed by fresh test/build output plus anchored source or structural evidence. The full suite passed (`27` files, `355` tests), the focused regression suite passed (`30` relevant tests), and build succeeded.
