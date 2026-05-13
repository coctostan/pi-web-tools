# Spec — Modernize extension API uptake (v4.1.0)

## Goal
Upgrade `pi-web-tools` from "compiles against pi 0.74.x" to "uses pi 0.74.x well": adopt the pi-provided abort `signal` for cancellation, branch the `session_start` handler by `event.reason`, move tool-input normalization into `ToolDefinition.prepareArguments`, and make the session result store survive `/compact`. Ship as v4.1.0.

## Acceptance Criteria

### Cancellation (#033)

1. **AC-CANCEL-1** — In `index.ts`, the `web_search` tool's `execute(...)` body passes the pi-provided `signal` argument directly to `searchExa` / `findSimilarExa` and contains no `new AbortController()`, no `AbortSignal.any`, and no calls to `pendingFetches`.

2. **AC-CANCEL-2** — `fetch_content`'s `execute(...)` passes the pi-provided `signal` directly to `extractContent`, `extractGitHub`, `fetchAllContent`, `filterContent`, and any `complete(...)` calls; no manual `AbortController` plumbing remains.

3. **AC-CANCEL-3** — `code_search`'s `execute(...)` passes the pi-provided `signal` directly to its downstream fetch/complete calls; no manual `AbortController` plumbing remains.

4. **AC-CANCEL-4** — `get_search_content`'s `execute(...)` passes the pi-provided `signal` directly to any `complete(...)` or fetch calls; no manual `AbortController` plumbing remains.

5. **AC-CANCEL-5** — The `pendingFetches` `Map<string, AbortController>` declared at module scope in `index.ts` is removed, along with the `abortAllPending()` helper.

6. **AC-CANCEL-6** — `handleSessionStart` and `handleSessionShutdown` no longer call `abortAllPending`.

7. **AC-CANCEL-7** — `index.test.ts` contains at least one test per tool that drives cancellation through the `signal` parameter passed to `execute(...)` and asserts the tool rejects/returns an aborted result; tests do not reference `pendingFetches` or `abortAllPending`.

### Session lifecycle (#036)

8. **AC-LIFECYCLE-1** — The `session_start` handler in `index.ts` is registered with `pi.on("session_start", handler)` and receives the typed `SessionStartEvent` (with `event.reason` and optional `event.previousSessionFile`).

9. **AC-LIFECYCLE-2** — On `reason: "startup"`, the handler calls (in order) `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, and `restoreFromSession(ctx)`.

10. **AC-LIFECYCLE-3** — On `reason: "reload"`, the handler does **not** call `clearUrlCache()` or `cleanupTempFiles()`. It still calls `clearCloneCache()` and `restoreFromSession(ctx)` (preserving today's reload behavior for the result store).

11. **AC-LIFECYCLE-4** — On `reason: "new"`, the handler calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, and `clearResults()` (or otherwise leaves the in-memory store empty), and does **not** call `restoreFromSession(ctx)`.

12. **AC-LIFECYCLE-5** — On `reason: "resume"`, the handler calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, then restores prior results (via `restoreFromSession(ctx)` and/or the disk-backed store from AC-COMPACT-1).

13. **AC-LIFECYCLE-6** — On `reason: "fork"`, the handler calls `clearCloneCache()`, `clearUrlCache()`, `cleanupTempFiles()`, then restores from `event.previousSessionFile` when present (via a new `restoreFromSessionFile(path)` helper that calls `loadEntriesFromFile(path)` from `@earendil-works/pi-coding-agent`, or by extending `restoreFromSession` to accept an explicit session-file path). When `previousSessionFile` is absent, the handler falls back to `restoreFromSession(ctx)`.

14. **AC-LIFECYCLE-7** — `index.test.ts` (or `storage.test.ts` where appropriate) contains a parameterized test covering each of the five `reason` branches (`startup`, `reload`, `new`, `resume`, `fork`) and asserts via spies/mocks which of `clearUrlCache`, `cleanupTempFiles`, `clearResults`, `restoreFromSession`/`restoreFromSessionFile` were called or skipped. The `fork` test asserts the call used `event.previousSessionFile`.

### prepareArguments (#037)

15. **AC-PREPARE-1** — Each of the four `pi.registerTool({...})` calls in `index.ts` defines a `prepareArguments` field that invokes the corresponding `normalize*Input` function (`normalizeWebSearchInput`, `normalizeFetchContentInput`, `normalizeCodeSearchInput`, `normalizeGetSearchContentInput`).

16. **AC-PREPARE-2** — Each tool's `execute(...)` body no longer calls `normalize*Input(params)`; it consumes the already-normalized `params` directly.

17. **AC-PREPARE-3** — The `tool-params.ts` `normalize*Input` exports return types match what each tool's `execute(...)` consumes (i.e. compatible with the post-prepare `params` shape).

18. **AC-PREPARE-4** — `WebSearchParams.numResults` is a constrained integer (e.g. `Type.Integer({ minimum: 1, maximum: 20 })`) — the bound clamp that today lives inside `execute(...)` either moves to schema or is preserved inside the prepare function.

19. **AC-PREPARE-5** — `FetchContentParams` is tightened so that schema-level validation (or the prepare function) requires at least one of `url` or `urls`; today's runtime check `"Either 'url' or 'urls' must be provided."` is preserved as a user-facing error.

20. **AC-PREPARE-6** — `tool-params.test.ts` contains focused tests for each `normalize*Input` covering at minimum: string→array coercion for `queries`/`urls`, `numResults` defaulting/clamping, `freshness`→`maxAgeHours` mapping, URL dedup (`dedupeUrls`), and the existing mutual-exclusivity / required-field error messages (`"'similarUrl' and 'query'/'queries' are mutually exclusive."`, `"Either 'query' or 'queries' must be provided."`, `"Either 'url' or 'urls' must be provided."`, `"'query' must be provided."`, `"'responseId' must be provided."`).

### Compaction-safe state (#032)

21. **AC-COMPACT-1** — A new disk-backed result-store module (extending `storage.ts` or a sibling file) persists the in-memory store from `storage.ts` to a JSON file located at `join(homedir(), ".pi", "cache", "web-tools", "results-<sessionId>.json")` (mirroring the `research-cache.json` location convention), where `<sessionId>` comes from `ctx.sessionManager.getSessionId()`.

22. **AC-COMPACT-2** — Every `storeResult(...)` invocation that is followed today by `pi.appendEntry("web-tools-results", storedData)` also writes the current store snapshot to the disk file from AC-COMPACT-1 (best-effort: a write failure must not break the tool call, matching `research-cache.ts` `saveCache` semantics).

23. **AC-COMPACT-3** — On `session_start`, when a disk file from AC-COMPACT-1 exists for the active session id, the result store is rehydrated from it. This restore is the source of truth; `restoreFromSession(ctx)` may still be called for backward-compatibility (entries it loads do not need to be re-persisted to disk on restore).

24. **AC-COMPACT-4** — On `session_shutdown`, the disk file for the current session id is deleted (best-effort). Stale files (older than 24 hours) belonging to other session ids are also pruned on `session_start`.

25. **AC-COMPACT-5** — `index.test.ts` contains a regression test that: (a) starts the extension with a fresh session id, (b) drives a `web_search` tool call that produces a `responseId`, (c) emits a `session_before_compact` event followed by a `session_compact` event that mutates the session log (simulating `appendEntry` records being unreachable), and (d) asserts a subsequent `get_search_content` call with the pre-compaction `responseId` still resolves successfully.

26. **AC-COMPACT-6** — `storage.test.ts` (or `index.test.ts`) contains a test asserting that a fresh `session_start` with a pre-existing disk file for the same session id rehydrates results without relying on `ctx.sessionManager.getEntries()`.

### Batch-wide

27. **AC-BATCH-1** — `npm test` exits 0 with no test marked `.skip` that was previously enabled, and the new tests above are part of the suite.

28. **AC-BATCH-2** — `package.json` `version` field is `4.1.0`.

29. **AC-BATCH-3** — A `# 4.1.0` section is added to `README.md` (or a dedicated `CHANGELOG.md` if one exists) summarizing: pi-native cancellation, smarter `session_start` lifecycle, `prepareArguments` adoption, compaction-safe result store.

30. **AC-BATCH-4** — At the end of the batch, `index.ts`'s line count is strictly less than its line count at the v4.0.0 tag (success signal that duplicated plumbing has been removed). Measured via `wc -l index.ts` before vs after.

## Out of Scope

- **Re-appending the result store via `pi.appendEntry` after `session_compact`** as the *primary* persistence mechanism. The disk-backed approach (AC-COMPACT-1..6) supersedes this. (From D1.) An `session_before_compact` subscription that triggers an opportunistic disk flush is allowed but optional (O1).
- **Changing the schema or location of `research-cache.json`** (from D2). The existing on-disk research cache already survives compaction and is unchanged by this batch.
- **v3.0 roadmap items** — structured `ptcValue` (#022), multi-source parallel fetch (#023), TTL-based research cache for cross-session reuse (#024). All deferred (from D3).
- **Tightening TypeBox fields beyond `numResults` and the `url`/`urls` requirement.** Additional tightening (e.g. `freshness` as an enum, `numResults` upper bound enforced in schema rather than prepare) is welcome but not required (from O2).
- **Documenting a `pi -e ./index.ts` smoke checklist** in the PR description — encouraged but not part of the acceptance contract (from O3).
- **Changes to public tool names, return content shapes, or CLI behavior** (from C6).

## Open Questions

None.

## Requirement Traceability

- `R1` → AC-CANCEL-1, AC-CANCEL-2, AC-CANCEL-3, AC-CANCEL-4
- `R2` → AC-CANCEL-5
- `R3` → AC-CANCEL-6
- `R4` → AC-CANCEL-7
- `R5` → AC-LIFECYCLE-1
- `R6` → AC-LIFECYCLE-2
- `R7` → AC-LIFECYCLE-3
- `R8` → AC-LIFECYCLE-4
- `R9` → AC-LIFECYCLE-5
- `R10` → AC-LIFECYCLE-6
- `R11` → AC-LIFECYCLE-7
- `R12` → AC-PREPARE-1
- `R13` → AC-PREPARE-2, AC-PREPARE-3
- `R14` → AC-PREPARE-4, AC-PREPARE-5
- `R15` → AC-PREPARE-6
- `R16` → AC-COMPACT-1, AC-COMPACT-2
- `R17` → AC-COMPACT-3
- `R18` → AC-COMPACT-5
- `R19` → AC-COMPACT-4
- `R20` → AC-BATCH-1
- `R21` → AC-BATCH-2
- `R22` → AC-BATCH-3
- `O1` → Out of Scope (defensive flush allowed but not required)
- `O2` → Out of Scope (additional schema tightening optional)
- `O3` → Out of Scope (PR-description nice-to-have)
- `D1` → Out of Scope (superseded by AC-COMPACT-1..6)
- `D2` → Out of Scope
- `D3` → Out of Scope
- `C1` → Precondition only; not a separate AC
- `C2` → Implementation ordering hint; consumed by plan phase, not by ACs
- `C3` → AC-BATCH-4
- `C4` → AC-BATCH-1
- `C5` → AC-COMPACT-1 (location pinned to `~/.pi/cache/web-tools/results-<sessionId>.json`)
- `C6` → Out of Scope (no AC needed because nothing in this spec changes public surface)
- `C7` → Background evidence already incorporated into AC-CANCEL-1..4 and AC-LIFECYCLE-1..7
