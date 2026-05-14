# Verification Report — 034-register-web-tools-slash-command-for-cac

## Test Suite Results

Full suite run fresh:

```text
> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ retry.test.ts (14 tests) 33ms
 ✓ scope-rescope.test.ts (3 tests) 27ms
 ✓ research-cache.test.ts (25 tests) 40ms
 ✓ offload.test.ts (9 tests) 11ms
 ✓ github-extract.clone.test.ts (4 tests) 127ms
 ✓ github-extract.test.ts (9 tests) 5ms
 ✓ config.test.ts (18 tests) 36ms
 ✓ exa-search.test.ts (37 tests) 77ms
 ✓ cli.usage.test.ts (2 tests) 5ms
 ✓ extract.test.ts (17 tests) 242ms
 ✓ smart-search.integration.test.ts (1 test) 1279ms
 ✓ dependencies.test.ts (2 tests) 6ms
 ✓ commands.test.ts (8 tests) 67ms
 ✓ exa-context.test.ts (9 tests) 30ms
 ✓ session-results-store.test.ts (6 tests) 13ms
 ✓ storage.test.ts (8 tests) 23ms
 ✓ smart-search.test.ts (11 tests) 38ms
 ✓ tool-params.test.ts (36 tests) 11ms
 ✓ cli.fetch.raw.test.ts (2 tests) 5ms
 ✓ ptc-value.test.ts (16 tests) 2090ms
 ✓ filter.test.ts (12 tests) 50ms
 ✓ cli.fetch.prompt.fallback.test.ts (2 tests) 6ms
 ✓ truncation.test.ts (7 tests) 12ms
 ✓ cli.code.test.ts (2 tests) 47ms
 ✓ cli.fetch.prompt.filtered.test.ts (1 test) 18ms
 ✓ cli.search.test.ts (2 tests) 21ms
 ✓ index.test.ts (78 tests) 3942ms

 Test Files  27 passed (27)
      Tests  341 passed (341)
   Duration  5.54s
```

Build/type check run fresh:

```text
> @coctostan/pi-exa-gh-web-tools@4.1.0 build
> tsc -p tsconfig.json && node -e "..."

✓ Build successful (0 units compiled)
```

Focused dependent tests run fresh after impact/symbol inspection:

```text
 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ commands.test.ts (8 tests) 10ms
 ✓ research-cache.test.ts (25 tests) 37ms
 ✓ index.test.ts (78 tests) 900ms

 Test Files  3 passed (3)
      Tests  111 passed (111)
   Duration  1.53s
```

Original symptom reproduction for this bugfix scope: focused slash-command registration test:

```text
 RUN  v3.2.4 /Users/maxwellnewman/pi/workspace/pi-web-tools

 ✓ index.test.ts (78 tests | 76 skipped) 202ms

 Test Files  1 passed (1)
      Tests  2 passed | 76 skipped (78)
   Duration  635ms
```

Impact evidence: `impact(["dispatch", "getCacheStats", "clearCache", "purgeExpired", "resetCounters"], addition)` returned: `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood`. I inspected the symbol graphs instead. Surfaced dependents were `index.ts` command handler and `handleSessionStart`; `commands.test.ts`, `research-cache.test.ts`, and `index.test.ts` all ran in the focused dependent run above.

Trace evidence: `trace(entry="web-tools", file="index.ts")` returned `Symbol "web-tools" not found in the graph`; `trace(entry="default", file="index.ts")` returned `Symbol "default" not found in the graph`. Because the trace tool could not resolve the anonymous default export or command name, I used anchored source plus `ast_search` to confirm the real entry path: `index.ts:136` default export calls `pi.registerCommand("web-tools", ...)` at `index.ts:178`, and that handler dynamically imports `./commands.js` and calls `dispatch(...)`.

LSP diagnostics: `commands.ts`, `research-cache.ts`, `index.ts`, `commands.test.ts`, `research-cache.test.ts`, and `index.test.ts` reported `0 error(s), 0 warning(s)` for files that responded; `commands.test.ts` did not respond to LSP, and the Vitest run above covered it.

## Per-Criterion Verification

### Criterion 1: The extension calls `pi.registerCommand("web-tools", { ... })` exactly once during default-export initialization.
**Evidence:** `grep registerCommand index.ts` returned 1 match, at `index.ts:178`. `ast_search` also found one structural call to `(pi as any).registerCommand("web-tools", { ... })` at `index.ts:178`. `index.test.ts:1896-1904` asserts `pi.registerCommand` called once, command name `web-tools`, and handler/completions exist. Focused registration test: 2 passed.
**Verdict:** pass

### Criterion 2: The registered command provides a description and filtered completions for `stats`, `clear-cache`, `purge-expired`, `recent`, `help`.
**Evidence:** `index.ts:178` includes `description: "Inspect and manage..."` and `getArgumentCompletions: (prefix) => ["stats", "clear-cache", "purge-expired", "recent", "help"].filter((n) => n.startsWith(prefix))...`. `index.test.ts:1907-1916` asserts all five values and prefix `pur` returns only `purge-expired`. Focused registration test: 2 passed.
**Verdict:** pass

### Criterion 3: `commands.ts` exports pure async `dispatch(subcommand: string, args: string, deps)` with injectable dependencies.
**Evidence:** `commands.ts:4-13` defines `DispatchDeps` with `getCacheStats`, `clearCache`, `purgeExpired`, `resetCounters`, `listResults`, `confirm`, `notify`, and `now`. `commands.ts:85` exports `async function dispatch(subcommand: string, _args: string, deps: DispatchDeps): Promise<void>`. `symbol_graph dispatch` showed `dispatch` only calls local formatting helpers and injected deps.
**Verdict:** pass

### Criterion 4: `dispatch("stats", ...)` outputs entries, hits, misses, oldest, newest, sizeBytes, and ttlMinutes.
**Evidence:** `commands.ts:33-43` formats all required fields. `commands.ts:91-93` emits `statsText(deps.getCacheStats())`. `commands.test.ts:69-89` asserts entries `3`, hits `7`, misses `2`, `sizeBytes` `1234`, `ttlMinutes` `1440`, and ISO oldest/newest appear. Focused tests: `commands.test.ts (8 tests) passed`.
**Verdict:** pass

### Criterion 5: `dispatch("clear-cache", ...)` confirms first; true clears and resets counters; false mutates nothing.
**Evidence:** `commands.ts:95-104` awaits `deps.confirm(...)`, returns on false before mutation, and on true calls `deps.clearCache()` then `deps.resetCounters()`. `commands.test.ts:93-110` covers confirm false and true branches, asserting no mutation on false and both calls on true. Focused tests passed.
**Verdict:** pass

### Criterion 6: `dispatch("purge-expired", ...)` invokes purge-expired and does not reset counters.
**Evidence:** `commands.ts:106-109` calls `deps.purgeExpired()` and not `resetCounters()`. `commands.test.ts:114-123` asserts `purgeExpired` called once and `resetCounters` not called. Focused tests passed.
**Verdict:** pass

### Criterion 7: `dispatch("recent", ...)` lists mixed session entries with type, short label, relative age, and char count.
**Evidence:** `commands.ts:54-69` computes labels/chars for `search`, `fetch`, and `context`; `commands.ts:71-82` includes `[type] label • age • chars`. `commands.ts:111-113` uses `deps.listResults()` and `deps.now()`. `commands.test.ts:127-157` uses one search, one fetch, one context entry and asserts type/labels/age plus line cap. Focused tests passed.
**Verdict:** pass

### Criterion 8: `dispatch("help", ...)` produces concise usage summary listing the five subcommands.
**Evidence:** `commands.ts:17-25` help text lists `stats`, `clear-cache`, `purge-expired`, `recent`, and `help`. `commands.ts:87-89` emits help for `help`. `commands.test.ts:19-29` asserts all five subcommands and <=20 lines. Focused tests passed.
**Verdict:** pass

### Criterion 9: Unknown subcommand emits unknown message and help/direction.
**Evidence:** `commands.ts:115` emits `Unknown subcommand: "${sub}". Try /web-tools help.` plus help text. `commands.test.ts:33-42` asserts `unknown subcommand` and `/web-tools help` or help content, <=20 lines. Focused tests passed.
**Verdict:** pass

### Criterion 10: Empty/whitespace args default to help.
**Evidence:** `commands.ts:86-89` trims subcommand and routes empty string to `helpText()`. `commands.test.ts:46-65` calls `dispatch("", ...)` and `dispatch("   ", ...)`, asserting help info severity and no unknown message. Focused tests passed.
**Verdict:** pass

### Criterion 11: Every dispatch output emitted via notify or returned text is <=20 lines.
**Evidence:** `commands.test.ts:28`, `41`, `63`, `88`, `109`, `122`, and `156` assert line caps for help, unknown, empty, stats, clear-cache, purge-expired, and recent. Source also caps recent at `MAX_LINES = 18` plus header (`commands.ts:73-82`), and other messages are shorter. Focused tests passed.
**Verdict:** pass

### Criterion 12: `research-cache.ts` maintains hits/misses and `getCached` increments correctly.
**Evidence:** `research-cache.ts:5-6` declares module-level `hits`/`misses`. `getCached` increments misses on no entry (`research-cache.ts:96`), misses on expired entry (`research-cache.ts:100-103`), and hits on unexpired return (`research-cache.ts:106-108`). `symbol_graph getCached` confirmed this source. `research-cache.test.ts:158-195` covers miss, hit, and expired miss increments. Focused tests passed.
**Verdict:** pass

### Criterion 13: `getCacheStats(cacheFilePath, ttlMinutes)` returns required stats and missing-file sizeBytes 0.
**Evidence:** `research-cache.ts:111-123` exports `getCacheStats`, reads cache values, calculates oldest/newest, uses `statSync` with catch to set `sizeBytes = 0`, and returns `{ entries, hits, misses, oldest, newest, sizeBytes, ttlMinutes }`. `symbol_graph getCacheStats` confirmed this source. `research-cache.test.ts:198-238` covers missing file zeros/nulls and populated cache entries/hits/misses/oldest/newest/sizeBytes/ttlMinutes. Focused tests passed.
**Verdict:** pass

### Criterion 14: `resetCounters()` zeros hits and misses.
**Evidence:** `research-cache.ts:8-11` sets `hits = 0` and `misses = 0`. `symbol_graph resetCounters` confirmed this source. `research-cache.test.ts:149-155` asserts counters are zero after reset. Focused tests passed.
**Verdict:** pass

### Criterion 15: `clearCache(cacheFilePath)` removes all entries and tolerates missing file.
**Evidence:** `research-cache.ts:62-68` exports `clearCache` and saves `{}` in a try/catch. `symbol_graph clearCache` confirmed this source. `research-cache.test.ts:241-262` covers emptying an existing cache file and missing-file no-throw. Focused tests passed.
**Verdict:** pass

### Criterion 16: `purgeExpired(cacheFilePath)` removes only expired entries, leaves fresh entries, does not touch counters, and tolerates missing file.
**Evidence:** `research-cache.ts:70-84` loads cache, returns on empty/missing, deletes only entries where `now > fetchedAt + ttlMinutes * 60 * 1000`, and saves the remaining cache. It does not reference `hits` or `misses`. `symbol_graph purgeExpired` confirmed this source. `research-cache.test.ts:265-307` covers expired-only removal, counter preservation, and missing-file no-throw. Focused tests passed.
**Verdict:** pass

### Criterion 17: `handleSessionStart` calls `resetCounters()` for all session-start reset reasons.
**Evidence:** `index.ts:72-75` starts `handleSessionStart` with `resetCounters()` before the reason switch, covering `startup`, `reload`, `new`, `resume`, and `fork`. `symbol_graph handleSessionStart` confirmed `resetCounters` as a callee. `index.test.ts:1920-1949` parameterizes all five reasons and asserts `resetCountersSpy` called once. Focused tests passed.
**Verdict:** pass

### Criterion 18: Real `clear-cache` binding in `index.ts` invokes `resetCounters()` after successful clear.
**Evidence:** `index.ts:178` command handler passes real deps to `dispatch`, including `clearCache: () => clearCache(DEFAULT_CACHE_FILE)` and `resetCounters: () => resetCounters()`. `commands.ts:95-104` confirms `resetCounters` is invoked only after confirmed clear. `ast_search resetCounters()` found the real binding at `index.ts:178`. Focused dependent tests passed.
**Verdict:** pass

### Criterion 19: Real `purge-expired` binding in `index.ts` does not invoke `resetCounters()`.
**Evidence:** `index.ts:178` passes separate deps for `purgeExpired: () => purgeExpired(DEFAULT_CACHE_FILE)` and `resetCounters`. `commands.ts:106-109` calls only `deps.purgeExpired()` for the `purge-expired` subcommand. `commands.test.ts:114-123` asserts reset is not called. Focused tests passed.
**Verdict:** pass

### Criterion 20: New `commands.test.ts` covers routing for stats, clear-cache, purge-expired, recent, help, unknown, empty, and clear-cache confirm branches.
**Evidence:** `commands.test.ts` contains describes/tests for `dispatch(help)` (`19-30`), `dispatch(unknown)` (`33-43`), `dispatch(empty)` (`46-66`), `dispatch(stats)` (`69-90`), `dispatch(clear-cache)` false and true (`93-111`), `dispatch(purge-expired)` (`114-124`), and `dispatch(recent)` (`127-158`). Focused run: `commands.test.ts (8 tests) passed`.
**Verdict:** pass

### Criterion 21: `research-cache.test.ts` covers `getCacheStats`, `clearCache`, `purgeExpired`, `resetCounters`, missing-cache paths, and `getCached` hit/miss increments.
**Evidence:** `research-cache.test.ts:149-155` reset counters; `158-195` getCached hit/miss/expired increments; `198-238` getCacheStats including missing file; `241-262` clearCache including missing file; `265-307` purgeExpired including missing file and no counter mutation. Focused run: `research-cache.test.ts (25 tests) passed`.
**Verdict:** pass

### Criterion 22: A test exercises `recent` against mixed-type store and asserts output stays within line cap.
**Evidence:** `commands.test.ts:127-157` builds one `search`, one `fetch`, and one `context` entry, dispatches `recent`, asserts all three types and labels, asserts age formatting, and asserts `msg.split("\n").length <= 20`. Focused run: `commands.test.ts (8 tests) passed`.
**Verdict:** pass

## Overall Verdict

pass

All 22 criteria are backed by fresh test output and anchored source/structural inspection. The full suite passed (27 files, 341 tests), the focused dependent tests passed (3 files, 111 tests), the slash-command registration reproduction passed (2 tests), and the build/type check completed successfully.
