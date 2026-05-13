# Brainstorm — Modernize extension API uptake (v4.1.0)

## Goal
After v4.0.0 made pi-web-tools compile against current pi (0.74.x), this batch upgrades it from "compiles" to "uses pi well." Four coordinated changes to `index.ts`, `tool-params.ts`, and the cross-turn state path: adopt the pi-provided abort `signal` for cancellation, branch the `session_start` handler by `event.reason`, move input normalization into `ToolDefinition.prepareArguments`, and make the session result store survive `/compact`. Target release: v4.1.0.

## Mode
`Direct requirements`. All four source issues already carry concrete acceptance criteria; the only real design choice (compaction-safety mechanism) and the three open questions were resolved during brainstorm.

## Must-Have Requirements

### Cancellation (#033)
- **R1** All four tool executors (`web_search`, `fetch_content`, `code_search`, `get_search_content`) use the `signal` argument provided to `execute(toolCallId, params, signal, onUpdate, ctx)` directly for cancellation; no manual `AbortController` wrapping and no `AbortSignal.any([...])` composition.
- **R2** The `pendingFetches` Map and `abortAllPending()` helper are removed from `index.ts`.
- **R3** `session_start` / `session_shutdown` handlers no longer call `abortAllPending`.
- **R4** Cancellation tests in `index.test.ts` exercise abort via the pi-native `signal` and still cover an in-flight cancellation case (request started → signal aborted → tool rejects with the documented cancellation error).

### Session lifecycle (#036)
- **R5** `handleSessionStart` receives the full `SessionStartEvent` (typed) and branches on `event.reason`.
- **R6** `reason: "startup"` performs full reset (`clearCloneCache`, `clearUrlCache`, `cleanupTempFiles`) plus restore from session log.
- **R7** `reason: "reload"` skips `clearUrlCache()` and `cleanupTempFiles()`, and only restores from the session log / disk-backed result store.
- **R8** `reason: "new"` performs full reset and does not attempt restore.
- **R9** `reason: "resume"` clears URL cache + temp files, then restores from the session log / disk-backed result store.
- **R10** `reason: "fork"` clears URL cache + temp files and restores the result store from `event.previousSessionFile` when present. Because today's `restoreFromSession(ctx)` only reads `ctx.sessionManager.getEntries()` (verified in `storage.ts`), this requires either extending its signature to accept an explicit session-file path or adding a sibling helper.
- **R11** Unit tests cover each `reason` branch and assert exactly which side effects ran or were skipped.

### prepareArguments (#037)
- **R12** Each `pi.registerTool({...})` call uses `prepareArguments: (raw) => normalize*Input(raw)`.
- **R13** Each tool's `execute(...)` body no longer calls `normalize*Input` directly — `prepareArguments` is the single source of truth.
- **R14** Visible TypeBox schemas are tightened where safe: at minimum `numResults` is a constrained integer, and `fetch_content` requires either `url` or `urls`.
- **R15** Each `prepareArguments` function has focused tests in `tool-params.test.ts` covering current normalization behavior (string→array coercion, `numResults` defaulting, `freshness`→`maxAgeHours` mapping, URL dedup).

### Compaction-safe state (#032)
- **R16** The session-level result store (`storage.ts`) is persisted to a disk file (analogous to `research-cache.json`) keyed by session id; this disk file is the source of truth for cross-turn lookups.
- **R17** On `session_start`, the result store is restored from the disk file (not from session-log replay) when the file exists for that session id.
- **R18** A regression test in `index.test.ts` simulates the `/compact` event sequence (`session_before_compact` → log mutation → `session_compact`) and asserts `get_search_content` still resolves a `responseId` generated before compaction.
- **R19** The disk file is cleaned up on `session_shutdown`, and stale files are reclaimed on the next `session_start` if shutdown didn't run cleanly.

### Batch-wide
- **R20** `npm test` is green at the end of the batch (current 258 tests + new tests added by this batch).
- **R21** `package.json` version is bumped to `4.1.0`.
- **R22** README/CHANGELOG adds a `# 4.1.0` entry summarizing the four modernization changes.

## Optional / Nice-to-Have
- **O1** Subscribe to `session_before_compact` as an opportunistic flush trigger (defense in depth; not the persistence mechanism).
- **O2** Tighten additional TypeBox fields beyond R14 where it's clearly safe (e.g. `freshness` as an enum, `numResults` upper bound).
- **O3** Short `pi -e ./index.ts` smoke checklist documented in the PR description: Esc cancels mid-fetch; reload preserves URL cache; `/compact` then `get_search_content` on a pre-compaction id works.

## Explicitly Deferred
- **D1** Re-appending the result store via `pi.appendEntry` after `session_compact` (rejected in favor of disk-backed approach R16; preserved here so it isn't silently dropped).
- **D2** Replacing the on-disk `research-cache.json` schema or location — not needed; the existing cache already survives compaction.
- **D3** Any v3.0 roadmap items (#022 ptcValue, #023 multi-source fetch, #024 TTL research cache) — out of scope for v4.1.

## Constraints
- **C1** Hard prerequisite: the v4.0.0 adaptation batch (#028, #026, #027, #029, #030) is merged. Confirmed on this branch.
- **C2** Landing order within the batch: **#033 → #036 → #037 → #032**. Each step intentionally slims the surface the next step touches.
- **C3** Net effect: `index.ts` must be meaningfully shorter than at the end of v4.0.0 — removed duplicated cancellation/lifecycle plumbing is a success signal.
- **C4** No regression in the existing test suite.
- **C5** The per-session result-store disk file follows the same `os.tmpdir()`-style location convention as `research-cache.json`; exact filename pattern (e.g. `pi-web-tools/results-<sessionId>.json`) is a spec-phase detail.
- **C6** No changes to public tool names, return shapes, or user-facing CLI behavior.
- **C7** Verified against `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`: `ExtensionContext.signal` is `AbortSignal | undefined` (undefined when not streaming), but the tool `execute(...)` signature receives a non-undefined per-call `signal` — that is the one to use (resolves prior Q2). `SessionStartEvent.reason` and `SessionStartEvent.previousSessionFile` are defined as described in #036 (resolves prior Q1's mechanism question).

## Open Questions
None.

## Recommended Direction

Land the four changes in the order **#033 → #036 → #037 → #032**. Each step deliberately reduces the surface area the next step has to touch: removing manual cancellation plumbing (#033) slims every `execute` body before #037 reshapes them; branching `session_start` (#036) clarifies which reasons even need cross-turn restore before #032 changes the restore mechanism.

For cancellation (#033), the verified type signature (`execute(..., signal: AbortSignal | undefined, ...)`) means tools should pass `signal` straight into Exa / fetch calls. The `pendingFetches` map is pure duplication of work pi now does and can be deleted, along with `abortAllPending`. The `ctx.signal` field exists but is documented as undefined when the agent is not streaming; the per-call `signal` is the correct hook for tool executors.

For session lifecycle (#036), `SessionStartEvent` exposes both `reason` and `previousSessionFile` as documented. Today's `restoreFromSession(ctx)` only reads `ctx.sessionManager.getEntries()`, so the `fork` branch requires either extending its signature or adding a `restoreFromSessionFile(path)` sibling — to be decided in the spec.

For compaction-safety (#032), persist the result store to its own disk file rather than relying on session-log replay. This mirrors how `research-cache.json` already survives `/compact` trivially, removes a special case instead of adding event plumbing, and is robust to future pi event renames. `session_before_compact` may be subscribed as an opportunistic flush (O1), but the disk file is authoritative.

For `prepareArguments` (#037), the `normalize*Input` functions in `tool-params.ts` become the prepare hooks themselves, returning `Static<TParams>`. The visible schema can then express the post-normalization shape, with at least `numResults` constrained and `fetch_content` requiring `url` xor `urls`. Looser coercions (string-to-array, `freshness`→`maxAgeHours` mapping) stay inside the prepare function. Net effect: `index.ts` shrinks, `/compact` no longer breaks `get_search_content`, and session lifecycle is precise enough to keep useful caches across `reload` without leaking stale state across `fork`.

## Testing Implications
- **Cancellation**: inject a fast-aborting `AbortSignal` into each tool's `execute` and assert the network call sees abort + the tool rejects with the documented cancellation error. Drop tests that relied on the removed `pendingFetches` / `abortAllPending` internals.
- **Session lifecycle**: parameterized test per `reason` (`startup`, `reload`, `new`, `resume`, `fork`) asserting which side effects (`clearUrlCache`, `cleanupTempFiles`, `restoreFromSession`/file variant) ran or were skipped; `fork` test asserts use of `event.previousSessionFile`.
- **`prepareArguments`**: per-tool focused tests in `tool-params.test.ts` covering string→array coercion, `numResults` defaulting, `freshness`→`maxAgeHours` mapping, URL dedup, and `fetch_content` requiring `url`/`urls`.
- **Compaction-safe storage**: simulate the compaction sequence and assert `get_search_content` resolves a pre-compaction `responseId`. Also assert disk-file restore on a fresh `session_start` with an existing file, and cleanup on `session_shutdown`.
- **Regression sweep**: full `npm test` green; prior cancellation/lifecycle tests updated to the new mechanism rather than dropped.
