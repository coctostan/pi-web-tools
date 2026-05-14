# Spec — /web-tools slash command

## Goal
Add a `/web-tools` slash command (registered via `pi.registerCommand`) to the pi-web-tools extension with subcommands `stats`, `clear-cache`, `purge-expired`, `recent`, and `help`, so users can inspect and manage the persistent research cache and the in-session results store without leaving pi. Routing lives in a new testable `commands.ts` module; cache observability and mutation helpers live in `research-cache.ts`.

## Acceptance Criteria

1. The extension calls `pi.registerCommand("web-tools", { ... })` exactly once during default-export initialization.
2. The registered `/web-tools` command provides a `description` and a `getArgumentCompletions` that returns the subcommand names `stats`, `clear-cache`, `purge-expired`, `recent`, `help` (filtered by prefix).
3. `commands.ts` exports a pure async `dispatch(subcommand: string, args: string, deps)` function whose dependencies (cache stats reader, cache clear, purge-expired, recent-results lister, confirm, notify, clock) are injectable.
4. `dispatch("stats", ...)` produces output containing: entry count, hit count, miss count, oldest entry timestamp, newest entry timestamp, total cache file size in bytes, and configured `cacheTTLMinutes`.
5. `dispatch("clear-cache", ...)` calls the injected `confirm` first; on `true` it invokes the cache-clear dep and the counter-reset dep; on `false` it performs no mutation.
6. `dispatch("purge-expired", ...)` invokes the purge-expired dep and does not invoke the counter-reset dep.
7. `dispatch("recent", ...)` lists session result entries with type (`search` / `fetch` / `context`), a short query/url label, age relative to the injected clock, and char count.
8. `dispatch("help", ...)` produces a concise usage summary listing the five subcommands.
9. `dispatch` with an unknown subcommand emits an "unknown subcommand" message and shows the help summary (or directs the user to `/web-tools help`).
10. `dispatch` with empty/whitespace-only args defaults to the `help` behavior.
11. Every `dispatch` output emitted via `notify` or returned text is ≤ 20 lines.
12. `research-cache.ts` maintains module-level `hits` and `misses` counters; `getCached` increments `hits` when an unexpired entry is returned and `misses` on cache-miss or expired-entry paths.
13. `research-cache.ts` exports `getCacheStats(cacheFilePath, ttlMinutes)` returning `{ entries, hits, misses, oldest, newest, sizeBytes, ttlMinutes }` (oldest/newest are timestamps or null when empty; sizeBytes is `0` when the file does not exist).
14. `research-cache.ts` exports `resetCounters()` that zeros `hits` and `misses`.
15. `research-cache.ts` exports `clearCache(cacheFilePath)` that removes all entries from the persistent cache file and tolerates a missing file without throwing.
16. `research-cache.ts` exports `purgeExpired(cacheFilePath)` that removes only entries past their TTL, leaves fresh entries intact, does not touch counters, and tolerates a missing file without throwing.
17. `index.ts`'s `handleSessionStart` calls `resetCounters()` so hits/misses zero out on `session_start` for all reasons that reset session state.
18. The `clear-cache` real-binding wired in `index.ts` invokes `resetCounters()` after a successful clear (binding ensures R9 even when called via the slash command).
19. The `purge-expired` real-binding wired in `index.ts` does not invoke `resetCounters()`.
20. A new `commands.test.ts` covers routing for each of `stats`, `clear-cache`, `purge-expired`, `recent`, `help`, an unknown subcommand, and empty args, plus the `clear-cache` confirm-false vs confirm-true branches.
21. `research-cache.test.ts` covers `getCacheStats`, `clearCache`, `purgeExpired`, and `resetCounters` including the missing-cache-file path, plus the `getCached` hit/miss counter increments.
22. A test exercises `recent` against a mixed-type store (one `search`, one `fetch`, one `context` entry) and asserts the output stays within the line cap.

## Out of Scope

- Inspecting individual cache entries by URL or key from the slash command (D1).
- A subcommand that retrieves stored `responseId` content — `get_search_content` already covers that (D2).
- Editing cache configuration (e.g. `cacheTTLMinutes`) from the slash command — config edits stay in `web-tools.json` (D3).
- Persisting hit/miss counters across sessions (D4).
- Hit-rate percentage in `stats` output (O1 — may be added later but not required).
- An optional integer arg to limit how many entries `recent` shows (O2 — may use a sensible default cap internally but is not part of the acceptance contract).
- Showing the cache file path in `stats` output (O3 — optional polish, not required).
- Introducing any new runtime dependency (C4).
- Building a parallel command-registration system outside `pi.registerCommand` (C1).
- Adding a new persistence layer for session results; `recent` reads from existing in-memory `getAllResults()` (C3).

## Open Questions

None.

## Requirement Traceability

- `R1` -> AC 1
- `R2` -> AC 4, AC 13
- `R3` -> AC 5, AC 15
- `R4` -> AC 6, AC 16
- `R5` -> AC 7
- `R6` -> AC 8
- `R7` -> AC 12
- `R8` -> AC 17
- `R9` -> AC 5, AC 18
- `R10` -> AC 6, AC 19
- `R11` -> AC 3
- `R12` -> AC 20
- `R13` -> AC 11
- `R14` -> AC 2
- `O1` -> Out of Scope
- `O2` -> Out of Scope
- `O3` -> Out of Scope
- `D1` -> Out of Scope
- `D2` -> Out of Scope
- `D3` -> Out of Scope
- `D4` -> Out of Scope
- `C1` -> AC 1, Out of Scope (parallel system)
- `C2` -> AC 13, AC 15, AC 16
- `C3` -> AC 7, Out of Scope (no new persistence)
- `C4` -> Out of Scope (no new deps)
- `C5` -> AC 11
- `C6` -> AC 15, AC 16
