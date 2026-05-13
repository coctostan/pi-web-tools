---
id: 40
type: feature
status: open
created: 2026-05-13T15:52:48.435Z
sources: [33, 36, 37, 32]
---
# Modernize extension API uptake (signals, lifecycle, prepareArguments, compaction-safe cache)
## Goal

After the v4.0.0 adaptation batch lands, this batch upgrades the extension from "compiles against current pi" to "uses current pi well". All four sub-issues mutate the same surface — `index.ts` session handlers, every `registerTool({...})` call, and the cross-turn state path — so doing them as one coordinated change avoids three full re-reviews of the same file.

Target release: v4.1.0.

## Member issues and recommended order

1. **#033 — Use `ctx.signal` for cancellation propagation**
   - Deletes the manual `pendingFetches` Map and `abortAllPending()` helper.
   - Simplifies each `async execute(...)` body — fewer lines for #037 to touch later.
   - Restores tests so cancellation flows through pi's native abort path.

2. **#036 — Smarter session lifecycle: differentiate reload/new/resume/fork**
   - Builds on the minimal `event.reason` split from #026.
   - Keeps URL cache + temp files on `reason: "reload"`.
   - Uses `event.previousSessionFile` for `fork`/`resume` log restoration.
   - Adds focused tests per reason branch.

3. **#037 — Adopt `ToolDefinition.prepareArguments`**
   - Moves `normalize*Input` calls out of `execute(...)` and into the `prepareArguments` hook.
   - Tightens the visible TypeBox schemas where safe (required fields, integer bounds).
   - Done after #033 so executes are already slim.

4. **#032 — Preserve research cache and stored results across compaction**
   - Subscribes to `session_before_compact` / `session_compact`.
   - Persists the session result store to disk (or re-appends via `appendEntry` after compaction completes).
   - Adds a regression test that simulates `/compact` and asserts `get_search_content` still resolves a pre-compaction `responseId`.

## Acceptance criteria for the batch

- All four sub-issues' acceptance criteria met.
- `npm test` green.
- `pi -e ./index.ts` smoke test: `Esc` mid-fetch cancels cleanly; a session reload preserves the URL cache; `/compact` then `get_search_content` on a pre-compaction id works.
- `index.ts` is meaningfully shorter than at the end of v4.0.0 (signal: removed duplicated lifecycle/cancellation plumbing).
- `package.json` version bumped to `4.1.0`.
- Changelog entry under `# 4.1.0` summarizes the modernization.

## Dependencies

- **Hard:** the entire v4.0.0 adaptation batch (issues #028, #026, #027, #029, #030) must land first.

## Non-goals (deferred)

- The remaining "polish" issues — #031 (auto-detect model list), #034 (`/web-tools` command), #035 (pdf-parse swap), #038 (freshness unify) — are independent and stay free-standing; they may ship in any order as v4.1.x / v4.2.x.

## References

- Pi changelog v0.63.0 (`prepareArguments`)
- Pi changelog v0.63.2 (`ctx.signal`)
- Pi changelog v0.65.0 (`session_start.reason`, `SessionBeforeCompactEvent`, `SessionCompactEvent`, `previousSessionFile`)
- `dist/core/extensions/types.d.ts` from the refreshed `.pi/npm` snapshot

