# Code Review — 034-register-web-tools-slash-command-for-cac

## Files Reviewed

- `index.ts` — registers `/web-tools`, wires real command dependencies, and resets cache counters on `session_start`.
- `commands.ts` — new pure dispatcher and formatters for `stats`, `clear-cache`, `purge-expired`, `recent`, `help`, unknown, and empty subcommands.
- `research-cache.ts` — cache counters, stats, clear, purge-expired, cache read/write helpers, and cache entry validation.
- `commands.test.ts` — dispatch routing, output line caps, confirm branches, failure notifications.
- `research-cache.test.ts` — cache stats/mutation helpers, missing/corrupt/invalid cache paths, and hit/miss counters.
- `index.test.ts` — command registration/completions and session-start counter reset coverage.

No `AGENTS.md` exists in this repository; conventions were inferred from `package.json` (`npm run build`, `npm test`) and the Vitest test suite.

## Review Inputs

- Ran `codex_review(base="main")` early. Adopted its initial finding that `commands.ts` / `commands.test.ts` must be included with the change because `index.ts:178` dynamically imports `./commands.js`. This is a repository-hygiene/release-packaging concern, not a logic defect in the working tree; the files exist and tests/build include them.
- Ran `codex_adversarial_review(base="main")` because the feature exposes a public command and destructive cache operations.
- Adopted adversarial findings for command-facing mutation/read failure handling:
  - `commands.ts:112-118` now avoids resetting counters or reporting success when `clearCache()` reports failure.
  - `commands.ts:122-128` now reports purge failure and includes removed/remaining counts when available.
  - `research-cache.ts:64-78`, `research-cache.ts:107-127`, and `research-cache.ts:155-169` now distinguish missing cache files from corrupt/unreadable/invalid cache files for admin command paths.
  - `research-cache.ts:47-62` now validates cache entries structurally and semantically, including map-key consistency, hash consistency, finite timestamps, and positive finite TTL.
- Rejected Codex's later `purge-expired` TTL finding at `research-cache.ts:107`: the spec explicitly requires `purgeExpired(cacheFilePath)` to remove entries past **their TTL** (AC 16), while `cacheTTLMinutes` is required for `stats` output (AC 4/13). Passing current config TTL would be a behavior change outside the acceptance contract.
- Rejected Codex's `/web-tools recent` response-id suggestion at `commands.ts:86` as non-blocking/out of scope. The spec requires type, short label, relative age, and char count (AC 7), and explicitly says retrieving stored responseId content remains covered by `get_search_content` rather than new slash-command behavior.
- Noted Codex repository-hygiene warnings (`.DS_Store`, `.codegraph/graph.db`, `.megapowers/state.json`, untracked plan artifacts). These are not code-level feature defects, but final publication should avoid unrelated local/generated artifacts except required Megapowers artifacts.

## Strengths

- `commands.ts:10-19` keeps dispatch dependencies injectable, which makes command routing deterministic and easy to test without Pi runtime globals.
- `commands.ts:91-136` has simple branch routing with explicit notifications and no hidden side effects beyond injected deps.
- `commands.ts:107-118` confirms before destructive clear, reports write failure, and resets counters only after a successful clear.
- `commands.ts:121-128` does not reset counters for purge and now reports result counts/failures when the real cache helper provides them.
- `research-cache.ts:64-83` cleanly separates typed load status from best-effort cache reads, preserving tolerant normal cache behavior while allowing admin commands to avoid false success.
- `research-cache.ts:47-62` rejects corrupt or semantically inconsistent cache entries before stats/purge operate on them, preventing invalid timestamps from reaching `new Date(...).toISOString()` in `commands.ts:35-37`.
- Tests cover success paths and reviewed failure paths: `commands.test.ts:92-96`, `commands.test.ts:120-126`, and `research-cache.test.ts:240-284` cover unreadable/corrupt/invalid admin paths added during review.

## Findings

### Critical

None.

### Important

None.

### Minor

1. `research-cache.ts:13-15` exports `getHitsForTest()` and `getMissesForTest()` from the production module.
   - **What's wrong:** Test-only accessors are part of the module's emitted public surface.
   - **Why it matters:** Consumers can import internals that are not intended as stable API.
   - **How to fix:** In a follow-up cleanup, test counters indirectly through `getCacheStats()` or group internals under a clearly unstable `__test` export.

2. `index.ts:178` contains the whole `/web-tools` command registration on one long line.
   - **What's wrong:** The handler, completions, and dependency wiring are harder to review and maintain than the surrounding multi-line code.
   - **Why it matters:** Future command changes will be noisier and more error-prone.
   - **How to fix:** In a follow-up refactor, extract `WEB_TOOLS_SUBCOMMANDS`/registration options or format the registration across multiple lines. No behavioral issue was found.

## Recommendations

- Before publishing/PR creation, ensure `commands.ts` and `commands.test.ts` are included in the final change set; Codex repeatedly reported them as untracked while reviewing against `main`.
- Keep unrelated local/generated files out of the release diff unless the Megapowers workflow intentionally owns them.
- Consider replacing test-only exports in `research-cache.ts` with black-box assertions through `getCacheStats()` in a future cleanup.

## Breaking Change / Impact Review

Ran `impact` with `changeType: "signature_change"` for public changed symbols (`clearCache`, `purgeExpired`, `dispatch`, `resetCounters`, `getCacheStats`, `getCached`). The final impact result returned no dependents for those symbols in the graph. Runtime callers in the working tree were still inspected directly:

- `index.ts:178` calls `clearCache(DEFAULT_CACHE_FILE)` and `purgeExpired(DEFAULT_CACHE_FILE)` through dispatch deps. The new return values are compatible with existing call sites and used by `commands.ts` for error reporting.
- `commands.ts:11-13` accepts `clearCache: () => boolean | void` and `purgeExpired: () => PurgeExpiredResult | void`, preserving compatibility with tests or callers whose injected deps return `void`.
- `getCacheStats()` gained an `ok: boolean` field; existing required fields remain present, and dispatch uses `ok === false` defensively.

## Verification After Review Fixes

Final build and test run:

```text
> @coctostan/pi-exa-gh-web-tools@4.1.0 build
> tsc -p tsconfig.json && node -e "const fs=require('fs'); fs.mkdirSync('dist/bin',{recursive:true}); fs.copyFileSync('bin/exa-tools','dist/bin/exa-tools.js'); fs.chmodSync('dist/bin/exa-tools.js',0o755)"

> @coctostan/pi-exa-gh-web-tools@4.1.0 test
> vitest run

 Test Files  27 passed (27)
      Tests  348 passed (348)
   Duration  1.68s
```

Focused tests added during review first failed RED, then passed after fixes:

- clear-cache failure does not reset counters and emits error.
- purge-expired failure emits error.
- corrupt stats cache emits error.
- corrupt cache file is not reported as clean empty stats.
- structurally invalid, mismatched-key, and non-finite/invalid cache entries are rejected.

## Assessment

ready

The code satisfies the verified spec and the code-review pass resolved the material data-loss/false-success and invalid-cache findings. Remaining items are minor maintainability/repository-hygiene follow-ups, not blockers for the feature logic.
