---
id: 30
type: bugfix
status: open
created: 2026-05-13T15:45:10.549Z
priority: 3
---
# Refresh .pi/npm vendored extension snapshot to pi 0.74.x / new scope
## Problem

The repo vendors a snapshot of the pi coding agent under `.pi/npm/node_modules/@mariozechner/pi-coding-agent` pinned to `0.73.0`. That snapshot is what local `pi` runs against when developing this extension, and it:

1. Lives under the legacy `@mariozechner` scope (deprecated in v0.74.0).
2. Is one minor version behind upstream.
3. Will drift further as the rescope rolls out across the ecosystem.

## Acceptance criteria

- `.pi/npm/node_modules/...` regenerated (via the appropriate `pi package install` / `npm install` flow inside `.pi/`) so it ships the current `@earendil-works/pi-coding-agent@^0.74` and `@earendil-works/pi-tui@^0.74`.
- The corresponding `.pi/npm/package-lock.json` (or equivalent) is committed and consistent.
- `pi -e ./index.ts` smoke-test against the refreshed snapshot still loads all four tools.
- Document in `README.md` (Development section) the command/flow used to refresh the vendored snapshot.

## Files likely touched

- `.pi/npm/node_modules/**`
- `.pi/npm/package-lock.json`
- `README.md` (Development section)

## Notes

This issue depends on the peer-dependency rescope being merged first; otherwise the snapshot will desync from the package's declared peers.

