# Brainstorm — /web-tools slash command

## Goal
Give users in-pi visibility and control over the `pi-web-tools` extension state by registering a top-level `/web-tools` slash command with subcommands for cache stats, cache clearing, expired-entry purging, recent-results listing, and help. Today users have no way to inspect or manage the persistent research cache or session result store without shell-level intervention.

## Mode
`Direct requirements`. The issue spec already enumerates concrete subcommands, output expectations, and file layout; the remaining work is preserving those as explicit requirements and capturing a few clarifications.

## Must-Have Requirements
- **R1** Register a top-level `/web-tools` command via `pi.registerCommand` from the extension entry point.
- **R2** Support subcommand `/web-tools stats` that prints: cache entry count, hit count since session start, miss count since session start, oldest entry timestamp, newest entry timestamp, total cache file disk size in bytes, and configured `cacheTTLMinutes`.
- **R3** Support subcommand `/web-tools clear-cache` that prompts via `ctx.ui.confirm` and, on confirm, deletes all entries from the persistent research cache file.
- **R4** Support subcommand `/web-tools purge-expired` that drops only entries whose age exceeds `cacheTTLMinutes`, leaving fresh entries intact.
- **R5** Support subcommand `/web-tools recent` that lists this session's `responseId`s with: type (`search` / `fetch` / `context`), short query/url label, age, and char count.
- **R6** Support subcommand `/web-tools help` that prints a short usage summary of the subcommands.
- **R7** Maintain hit and miss counters in `research-cache.ts` that increment on `getCached` calls (hit when an unexpired entry is returned, miss otherwise) and export them.
- **R8** Reset hit/miss counters to zero on `session_start`.
- **R9** Reset hit/miss counters to zero as part of `/web-tools clear-cache` (since the cache is empty afterward).
- **R10** Leave hit/miss counters unchanged on `/web-tools purge-expired`.
- **R11** Subcommand dispatch must be implemented as a pure, testable function (e.g. in a new `commands.ts`) — not buried inside a closure in `index.ts`.
- **R12** Provide unit tests for the command-routing/dispatch function covering each subcommand path and the unknown-subcommand path.
- **R13** All user-facing output goes through `ctx.ui.notify(...)` or is returned text and stays concise (≤ 20 lines per invocation).
- **R14** Subcommand autocomplete is wired up so the registered subcommand names are discoverable from the slash menu (via `getArgumentCompletions` on `pi.registerCommand`).

## Optional / Nice-to-Have
- **O1** `/web-tools stats` includes derived hit-rate percentage when (hits + misses) > 0.
- **O2** `/web-tools recent` accepts an optional integer arg to control how many entries to show (default sensible cap, e.g. 20).
- **O3** `/web-tools stats` shows the cache file path so users can locate it.

## Explicitly Deferred
- **D1** No subcommand to inspect individual cache entries by URL or key (out of scope; users can still `read` the cache file directly).
- **D2** No "show full content of a stored responseId" subcommand — `get_search_content` already exposes that to the agent.
- **D3** No global cache-config editing from the slash command (TTL changes still go through `web-tools.json`).
- **D4** No cross-session hit/miss persistence — counters are session-lifetime only.

## Constraints
- **C1** Must use `pi.registerCommand` from `@earendil-works/pi-coding-agent`; do not invent a parallel command system.
- **C2** Persistent cache lives at `~/.pi/cache/web-tools/research-cache.json` (`DEFAULT_CACHE_FILE` in `index.ts`); stats/clear/purge operate on that path.
- **C3** Session result inventory comes from the existing in-memory `store` in `storage.ts` (`getAllResults`) — no new persistence layer.
- **C4** Must not introduce new runtime dependencies; reuse existing modules (`research-cache.ts`, `storage.ts`, `config.ts`).
- **C5** Subcommand output must not assume a TTY beyond what `ctx.ui.notify` / returned strings provide; stay terminal-friendly and concise.
- **C6** Cache mutation (`clear-cache`, `purge-expired`) must tolerate a missing cache file gracefully (no-op with informative message).

## Open Questions
None.

## Recommended Direction
Add a new `commands.ts` exporting a pure `dispatch(subcommand, args, deps)` function whose `deps` are injectable (cache stats reader, cache clear, cache purge-expired, recent-results lister, confirm callback, notify callback, clock). `index.ts` registers `/web-tools` with `pi.registerCommand`, parses the first whitespace-delimited token as the subcommand, and calls `dispatch` with real implementations bound to `research-cache.ts`, `storage.ts`, and `ctx.ui`. This keeps `index.ts` thin and makes routing trivially testable.

In `research-cache.ts`, add module-level `hits` and `misses` counters, increment them inside `getCached` (hit on successful return, miss on null/expired), and export `getCacheStats(cacheFilePath)` that returns `{ entries, hits, misses, oldest, newest, sizeBytes, ttlMinutes }`. Add `resetCounters()`, `clearCache(cacheFilePath)`, and `purgeExpired(cacheFilePath)` helpers that reuse the existing `loadCache` / `saveCache` internals. Hook `resetCounters()` into `handleSessionStart` and into the `clear-cache` handler.

For `recent`, iterate `getAllResults()` from `storage.ts`, derive a one-line summary per entry (type-aware: queries joined for `search`, first URL for `fetch`, query for `context`), and format age from `entry.timestamp`. Autocomplete via `getArgumentCompletions` lists the five subcommand names so they surface in the slash menu.

Tests live in a new `commands.test.ts` and exercise `dispatch` with stubbed deps, asserting that each subcommand calls the right collaborators and that `clear-cache` only proceeds when `confirm` resolves true.

## Testing Implications
- Unit-test `dispatch` for routing: `stats`, `clear-cache`, `purge-expired`, `recent`, `help`, unknown subcommand, and empty/`""` args (default to `help`).
- Unit-test `clear-cache` honors `confirm: false` (no mutation) vs `confirm: true` (mutation + counter reset).
- Unit-test `purge-expired` removes only entries past TTL, leaves fresh ones, and does not touch hit/miss counters.
- Unit-test new `getCacheStats` / `clearCache` / `purgeExpired` / `resetCounters` helpers in `research-cache.test.ts`, including missing-cache-file behavior.
- Unit-test that `getCached` increments `hits` on a fresh entry and `misses` on a miss or expired entry, and that `resetCounters` zeroes both.
- Integration-style test that `recent` summarizes a mixed-type store (search + fetch + context) without exceeding the line cap.
