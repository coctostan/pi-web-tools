---
id: 39
type: bugfix
status: done
created: 2026-05-13T15:52:48.434Z
sources: [28, 26, 27, 29, 30]
---
# Adapt pi-web-tools to pi 0.74.x (rescope + removed APIs)
## Goal

Make `@coctostan/pi-exa-gh-web-tools` build and run cleanly against the current pi coding agent release (`@earendil-works/pi-coding-agent@^0.74.0`). This batch covers every compile-time / runtime breakage introduced by the npm scope migration and the v0.63–v0.65 extension-API consolidation.

This is a single coordinated release (v4.0.0) because the sub-tasks share `package.json`, `index.ts`, `filter.ts`, the vendored `.pi/npm` snapshot, and the README — splitting them produces broken intermediate states.

## Member issues and recommended order

1. **#028 — Rescope peer deps `@mariozechner/*` → `@earendil-works/*`**
   - Touch `package.json` peerDependencies.
   - Update every `from "@mariozechner/..."` import.
   - Run `npm install` to refresh `node_modules` + lock.
   - Establishes the new type surface that the remaining items target.

2. **#026 — Migrate session_switch / session_fork / session_tree → session_start with reason**
   - Drops three deprecated `pi.on(...)` registrations.
   - Keeps `session_start` and `session_shutdown` as canonical lifecycle hooks.
   - Branches on `event.reason` (`"startup" | "reload" | "new" | "resume" | "fork"`) — minimal split, more refinement comes later in #036.

3. **#027 — Replace `ModelRegistry.getApiKey` with `getApiKeyAndHeaders`**
   - Updates `filter.ts` to use the v0.63 API.
   - Threads optional `headers` through to `completeFn`.
   - Adds tests for both `{ok: true}` and `{ok: false}` paths.

4. **#030 — Refresh `.pi/npm` vendored extension snapshot**
   - Regenerates the local pi snapshot used for `pi -e ./index.ts` testing.
   - Documents the refresh command in `README.md` (Development section).

5. **#029 — Update README package metadata, install instructions, dead links**
   - Replaces `nicholasgasior/pi-coding-agent` with the current upstream.
   - Verifies / updates `pi install` syntax.
   - Notes the new peer-dependency scope.

## Acceptance criteria for the batch

- `npm test` is green (all 258 tests pass; updated counts welcome).
- `npm pack --dry-run` and `npm publish --access public --dry-run` succeed.
- `pi -e ./index.ts` loads all four tools against the refreshed vendored snapshot.
- No remaining references to `@mariozechner/*`, `nicholasgasior/pi-coding-agent`, `session_switch`, `session_fork`, `session_tree`, or `registry.getApiKey(` anywhere in the repo.
- `package.json` version bumped to `4.0.0` (major bump because peer-scope rename is breaking for downstream).
- A changelog entry under `# 4.0.0` summarizes the adaptation.

## Non-goals (deferred)

- Smarter session-reason branching (#036)
- `ctx.signal` plumbing (#033)
- `prepareArguments` adoption (#037)
- Compaction-aware cache persistence (#032)
- Any feature additions

These are intentionally pushed to the modernization batch (Phase 2) so v4.0.0 is a clean "still does the same thing, just on current pi" cut.

## References

- Pi changelog v0.63.0 (`getApiKeyAndHeaders`, `prepareArguments`)
- Pi changelog v0.65.0 (session event consolidation)
- Pi changelog v0.74.0 (`@earendil-works/*` scope migration)

