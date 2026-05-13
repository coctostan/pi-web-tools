---
id: 28
type: bugfix
status: open
created: 2026-05-13T15:45:10.549Z
priority: 1
---
# Rescope peer dependencies from @mariozechner/* to @earendil-works/*
## Problem

`package.json` peer dependencies still reference the deprecated `@mariozechner/*` scope:

```json
"peerDependencies": {
  "@mariozechner/pi-coding-agent": "*",
  "@mariozechner/pi-tui": "*",
  "@sinclair/typebox": "*"
}
```

As of pi v0.74.0 (2026-05-07) those packages have been republished under `@earendil-works/*` and the legacy scope will eventually be unpublished/deprecated. New installs of `pi-web-tools` against fresh pi will fail to resolve a peer.

The codebase also has direct imports referencing the old scope:
- `index.ts:1` — `from "@mariozechner/pi-coding-agent"`
- `index.ts:2` — `from "@mariozechner/pi-tui"`
- `index.ts:4` — `from "@mariozechner/pi-ai"`
- `filter.ts:1-2` — same

## Acceptance criteria

- `peerDependencies` switched to `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` with a sensible version constraint (e.g. `^0.74.0`).
- All `from "@mariozechner/..."` imports across `.ts` files updated to the new scope (note `pi-ai` may remain under its current package — verify against the current `pi-mono` monorepo).
- `node_modules` reinstalled cleanly; `npm test` passes; `npm pack --dry-run` shows no stale references.
- README install instructions (`pi install npm:@coctostan/pi-exa-gh-web-tools`) re-tested against current `pi`.
- A backwards-compat shim is **not** required — bump the major to `4.0.0` if it breaks downstream users on old pi.

## Files likely touched

- `package.json`
- `index.ts`, `filter.ts`, any other file importing from `@mariozechner/*`
- `README.md` (version mention)
- `package-lock.json` (regenerated)

## References

- Pi changelog v0.74.0 — npm scope migration

