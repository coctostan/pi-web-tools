# Verification Report — 025-add-standalone-exa-tools-cli

## Test Suite Results

```
 Test Files  23 passed (23)
      Tests  258 passed (258)
   Duration  1.13s
```

All 258 tests pass, including 11 new CLI tests across 6 test files.

## Per-Criterion Verification

### Criterion 1: `package.json` declares a binary named `exa-tools` that resolves to `dist/bin/exa-tools.js` after build.
**Evidence:** `node -e "..." → bin field: {"exa-tools":"dist/bin/exa-tools.js"}`
**Verdict:** pass

### Criterion 2: The repo contains a source CLI entrypoint at `bin/exa-tools` that is included in the build output as `dist/bin/exa-tools.js`.
**Evidence:** `test -f bin/exa-tools` → SOURCE EXISTS; `test -f dist/bin/exa-tools.js` → BUILD OUTPUT EXISTS. Content of both files matches (shebang + `import { runCli } from "../cli.js"`). Clean rebuild (`rm -rf dist && npm run build`) reproduces both files.
**Verdict:** pass

### Criterion 3: The CLI supports exactly these subcommands for this issue: `search`, `code`, and `fetch`.
**Evidence:** `cli.ts:108` — `isKnownCommand` returns true only for `"search"`, `"code"`, `"fetch"`. Usage test verifies all three appear in help text. Unknown commands exit 1 with error (tested in `cli.usage.test.ts`).
**Verdict:** pass

### Criterion 4: `exa-tools search "<query>"` executes web search by dispatching to the existing Exa search logic rather than a new CLI-specific search client.
**Evidence:** `cli.ts:144` calls `deps.searchExa(query, ...)` where default deps point to `searchExa` imported from `./exa-search.js` (line 1). Test `cli.search.test.ts:50` asserts `deps.searchExa` was called with correct args. No HTTP logic in cli.ts.
**Verdict:** pass

### Criterion 5: `exa-tools search "<query>" --n <count>` accepts a result-count option and passes that count to the existing search path.
**Evidence:** `cli.ts:58-62` parses `--n` flag into `numResults`. Test `cli.search.test.ts:50-53` passes `["search", "vitest mock fetch", "--n", "2"]` and asserts `searchExa` called with `numResults: 2`.
**Verdict:** pass

### Criterion 6: `exa-tools code "<query>"` executes code search by dispatching to the existing Exa context/code-search logic rather than a new CLI-specific code-search client.
**Evidence:** `cli.ts:154` calls `deps.searchContext(query, ...)` where default deps point to `searchContext` from `./exa-context.js` (line 2). Test `cli.code.test.ts:48` asserts `deps.searchContext` called with correct args.
**Verdict:** pass

### Criterion 7: `exa-tools code "<query>" --tokens <count>` accepts a token-count option and passes that count to the existing code-search path.
**Evidence:** `cli.ts:77-81` parses `--tokens` flag into `tokensNum`. Test `cli.code.test.ts:48-51` passes `["code", "vitest mock fetch", "--tokens", "800"]` and asserts `searchContext` called with `tokensNum: 800`.
**Verdict:** pass

### Criterion 8: `exa-tools fetch "<url>"` executes content extraction by dispatching to the existing extraction pipeline rather than a new CLI-specific extractor.
**Evidence:** `cli.ts:164` calls `deps.extractContent(url)` where default deps point to `extractContent` from `./extract.js` (line 3). Test `cli.fetch.raw.test.ts:40` asserts `deps.extractContent` called with the URL.
**Verdict:** pass

### Criterion 9: `exa-tools fetch "<url>"` without `--prompt` writes the full extracted markdown for that URL to stdout and does not use the extension's file-first preview/temp-file output format.
**Evidence:** `cli.ts:170` writes `formatFetchedMarkdown(result.title, result.content)` to `io.stdout`. Test `cli.fetch.raw.test.ts:41` asserts stdout equals full extracted content. Test line 42 asserts `not.toContain("Full content saved to")` — explicitly verifying no file-first format.
**Verdict:** pass

### Criterion 10: `exa-tools fetch "<url>" --prompt "<question>"` attempts focused extraction via the existing prompt/filter flow when a usable filter model is available to the CLI runtime.
**Evidence:** `cli.ts:173-177` — when `deps.filterContent` exists and returns non-null `filtered`, outputs the focused answer. Test `cli.fetch.prompt.filtered.test.ts` verifies `filterContent` is called with content+prompt, and stdout contains only the filtered answer (not the raw body).
**Verdict:** pass

### Criterion 11: If `exa-tools fetch "<url>" --prompt "<question>"` cannot use a filter model or filter-model API key, the CLI writes a warning to stderr, writes the raw extracted markdown to stdout, and exits with status code `0`.
**Evidence:** Two test cases in `cli.fetch.prompt.fallback.test.ts`:
1. Filter returns `{ filtered: null, reason: "No filter model available" }` → stderr: "Warning: No filter model available", stdout: raw markdown, exit 0.
2. Filter returns `{ filtered: null, reason: "API key expired" }` → stderr: "Warning: API key expired", stdout: raw markdown, exit 0.
Also `cli.ts:182-185` handles the case where `deps.filterContent` is undefined (no filter dep at all).
**Verdict:** pass

### Criterion 12: On successful execution, the CLI exits with status code `0` and writes its primary result as clean markdown to stdout.
**Evidence:** All success-path tests assert `exitCode` is `0` and `stderr` is `[]`:
- `cli.search.test.ts:49,55` — search: exit 0, no stderr
- `cli.code.test.ts:47,53` — code: exit 0, no stderr
- `cli.fetch.raw.test.ts:38,44` — fetch: exit 0, no stderr
- `cli.fetch.prompt.filtered.test.ts:49,57` — prompted fetch: exit 0, no stderr
**Verdict:** pass

### Criterion 13: On invalid usage or execution error, the CLI writes a clear error message to stderr and exits with status code `1`.
**Evidence:** Tests:
- `cli.usage.test.ts:22-23` — no subcommand: exit 1, stderr contains usage
- `cli.usage.test.ts:36-39` — unknown command: exit 1, stderr contains "Unknown command: wat"
- `cli.search.test.ts:65-67` — missing API key: exit 1, stderr contains "EXA_API_KEY"
- `cli.code.test.ts:63-65` — missing API key: exit 1, stderr contains "EXA_API_KEY"
- `cli.fetch.raw.test.ts:58-60` — fetch error: exit 1, stderr contains error message
**Verdict:** pass

### Criterion 14: Commands that require Exa search access (`search` and `code`) read the API key from `EXA_API_KEY`, and if that variable is missing the CLI fails with a clear error message on stderr.
**Evidence:** `cli.ts:111-117` — `requireExaApiKey()` reads `process.env.EXA_API_KEY`, throws if missing. Called at lines 145 and 155 for search and code. Tests in `cli.search.test.ts:60-68` and `cli.code.test.ts:58-66` verify: `delete process.env.EXA_API_KEY` → exit 1, stderr contains "EXA_API_KEY", underlying function not called.
**Verdict:** pass

### Criterion 15: The CLI implementation reuses existing lower-level modules for Exa requests and content extraction; this issue must not introduce duplicated Exa HTTP-call logic or a duplicated readability/extraction pipeline in the CLI layer.
**Evidence:** `cli.ts` imports only from `./exa-search.js`, `./exa-context.js`, `./extract.js`. `grep -n "fetch\|http\|exa.ai" cli.ts` returns only CLI arg parsing strings, no HTTP calls. All network operations are delegated via the `deps` interface.
**Verdict:** pass

### Criterion 16: The CLI can run as a standalone Node entrypoint without depending on Pi tool registration, session lifecycle, result storage, temp-file offloading, or TUI rendering behavior from `index.ts`.
**Evidence:** `grep -n "index\|storage\|offload\|session\|tool-params\|addTool\|ExtensionAPI\|TUI" cli.ts bin/exa-tools` returns only variable name matches (`index` in `args[index]`). No imports from `index.ts`, `storage.ts`, `offload.ts`, `tool-params.ts`, or any Pi/TUI modules.
**Verdict:** pass

### Criterion 17: Project documentation includes standalone CLI installation and usage guidance, including global installation via `npm install -g @coctostan/pi-exa-gh-web-tools`.
**Evidence:** `README.md` contains:
- Line 76: `## Standalone CLI` section header
- Line 83: `npm install -g @coctostan/pi-exa-gh-web-tools`
- Line 91: `export EXA_API_KEY="your-key-here"`
- Line 99: `exa-tools search "vitest mock fetch" --n 3`
- Line 105: `exa-tools code "vitest mock fetch" --tokens 800`
- Line 111: `exa-tools fetch "https://vitest.dev/guide/mocking.html"`
- Line 117: `exa-tools fetch "..." --prompt "How do I mock a function?"`
- Lines 123-125: stdout/stderr behavior documented
**Verdict:** pass

## Overall Verdict
**pass**

All 17 acceptance criteria verified with direct evidence from test output, code inspection, and build artifacts. 258 tests pass. Build succeeds and produces the expected binary output.
