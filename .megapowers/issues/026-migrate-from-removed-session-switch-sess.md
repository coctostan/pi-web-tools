---
id: 26
type: bugfix
status: done
created: 2026-05-13T15:45:10.548Z
priority: 1
---
# Migrate from removed session_switch/session_fork/session_tree events to session_start with reason
## Problem

`index.ts` subscribes to three extension events that have been removed from the pi coding agent extension API since v0.65.0:

```ts
pi.on("session_switch", async (_event, ctx) => { handleSessionStart(ctx); });
pi.on("session_fork",   async (_event, ctx) => { handleSessionStart(ctx); });
pi.on("session_tree",   async (_event, ctx) => { handleSessionStart(ctx); });
```

The replacement is a single `session_start` event whose payload exposes `event.reason: "startup" | "reload" | "new" | "resume" | "fork"` and `event.previousSessionFile` (set for `new`/`resume`/`fork`). Against the current `@earendil-works/pi-coding-agent` (0.74.x), the old `on(...)` overloads no longer exist, so this is a TypeScript compile error against the latest API and a no-op at runtime — sessions started via `/new`, `/resume`, or `/fork` will no longer abort pending fetches, clear clone/url caches, or clean up temp files.

## Acceptance criteria

- Remove the three deprecated `pi.on("session_switch"|"session_fork"|"session_tree", ...)` registrations.
- Keep `session_start` (and `session_shutdown`) as the canonical lifecycle hooks.
- Inspect `event.reason` to avoid wiping the in-memory state on benign `"reload"` events (a `reload` should not blow away the URL cache or temp files, only `new`/`resume`/`fork`/`startup` should).
- Existing `index.test.ts` lifecycle tests are updated to exercise the new reasons; full test suite stays green.

## Files likely touched

- `index.ts` (session handlers, lines ~133–155)
- `index.test.ts` (session lifecycle suite)

## References

- Pi changelog v0.65.0 — extension event consolidation
- `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts` — current `ExtensionAPI.on` overloads

