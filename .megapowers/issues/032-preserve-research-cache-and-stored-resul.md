---
id: 32
type: feature
status: open
created: 2026-05-13T15:45:10.549Z
priority: 4
---
# Preserve research cache and stored results across session_before_compact / session_compact
## Problem

This extension keeps two pieces of cross-turn state:

1. The session-level in-memory result store (`storage.ts` — `storeResult`/`getResult`) used by `get_search_content`.
2. The on-disk research cache (`research-cache.ts`) keyed by `URL + prompt + model`.

Both are loaded once at `session_start` via `restoreFromSession(ctx)` and persisted via `pi.appendEntry("web-tools-results", ...)`. But the extension does **not** subscribe to `session_before_compact` or `session_compact`, which were added/renamed across pi v0.63–v0.66.

Today's behavior after `/compact`:

- The compaction summary replaces conversation entries, so `appendEntry("web-tools-results", ...)` records become unreachable for replay via `restoreFromSession`.
- `responseId`s emitted before compaction still appear in stored answers/summary, but `get_search_content` cannot find them.

This shows up as `No result found for responseId "<id>"` errors after a compaction.

## Acceptance criteria

- Subscribe to `session_before_compact` to dump the current in-memory store to a serializable form and re-append it after compaction finishes (via `session_compact`).
- Alternatively, write the result store to a small disk file (similar to `research-cache.json`) keyed by session id and restore from disk on `session_start` regardless of compaction.
- Add a test in `index.test.ts` that simulates a compaction event and verifies `get_search_content` still resolves a `responseId` generated before compaction.

## Files likely touched

- `index.ts` (event registrations + handlers)
- `storage.ts` (export/import helpers if needed)
- `index.test.ts`
- Possibly `storage.test.ts`

## References

- Pi changelog v0.63.x – v0.66.x — `session_before_compact`, `session_compact` events
- `dist/core/extensions/types.d.ts` — `SessionBeforeCompactEvent`, `SessionCompactEvent`

