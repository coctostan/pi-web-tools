---
id: 34
type: feature
status: done
created: 2026-05-13T15:50:54.039Z
priority: 3
---
# Register /web-tools slash command for cache stats, clear, and recent-results inspection
## Problem

Users currently have zero in-pi visibility into the extension's state:

- No way to see how many entries the research cache holds, hit rate, or how much disk it uses.
- No way to clear an expired/stale cache without `rm -rf ~/.pi/cache/web-tools/research-cache.json`.
- No way to list `responseId`s already produced this session (other than scrolling back).

`pi.registerCommand` (`@earendil-works/pi-coding-agent`) already supports nested subcommands with autocomplete, and the extension never uses it.

## Acceptance criteria

Register a top-level `/web-tools` command with subcommands:

- `/web-tools stats` — prints cache entry count, hit/miss counters since session start, oldest/newest entry, total disk size, configured TTL.
- `/web-tools clear-cache` — purges the persistent research cache after a confirm dialog (`ctx.ui.confirm`).
- `/web-tools purge-expired` — drops only entries older than `cacheTTLMinutes` without touching fresh ones.
- `/web-tools recent` — lists this-session `responseId`s with type (`search`/`fetch`/`context`), query/url, age, and char count.
- `/web-tools help` — short usage.

Implementation notes:

- Hit/miss counters belong in `research-cache.ts` (export them) and reset on `session_start`.
- All output goes through `ctx.ui.notify(...)` or returned text — keep it concise (≤ 20 lines).
- Add basic unit tests for the command-routing function (pull subcommand dispatch into a testable pure function rather than burying it in the closure).

## Files likely touched

- `index.ts` (registerCommand)
- `research-cache.ts` (counters, stats helpers)
- `storage.ts` (recent helper)
- New `commands.ts` (subcommand router)
- New `commands.test.ts`

## Notes

Depends on the rescope (#028) only insofar as `registerCommand` types come from the new package; either scope works.

