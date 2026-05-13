---
id: 36
type: feature
status: done
created: 2026-05-13T15:50:54.040Z
priority: 3
---
# Smarter session lifecycle: differentiate reload/new/resume/fork in session_start handler
## Problem

Even after #026 lands, the migrated `session_start` handler will still treat every reason identically — calling `abortAllPending(); clearCloneCache(); clearUrlCache(); cleanupTempFiles(); restoreFromSession(ctx);` no matter what. That's too aggressive in some cases and not aggressive enough in others:

| `reason` | Today (post-#026) | Better behavior |
|----|----|----|
| `startup` | wipe everything, restore | correct |
| `reload` | wipe everything, restore | keep URL cache + temp files; only restore from session log |
| `new` | wipe, restore (will be empty) | wipe everything; nothing to restore |
| `resume` | wipe, restore | wipe URL cache + temp files; restore from session log |
| `fork` | wipe, restore | wipe URL cache + temp files; restore from parent session log via `event.previousSessionFile` |

The `event.reason` and `event.previousSessionFile` fields exposed by the v0.65 `SessionStartEvent` make this trivially expressible.

## Acceptance criteria

- `handleSessionStart` accepts the full `SessionStartEvent` and branches on `event.reason`.
- `reload` skips `clearUrlCache()` and `cleanupTempFiles()` (these only matter across "real" session changes).
- `fork` uses `event.previousSessionFile` for log restoration when applicable (today's `restoreFromSession(ctx)` may already be parent-aware — verify).
- New unit tests cover each `reason` branch.
- All 258 existing tests stay green.

## Files likely touched

- `index.ts`
- `index.test.ts`

## Dependencies

- Builds on #026 (event migration).

