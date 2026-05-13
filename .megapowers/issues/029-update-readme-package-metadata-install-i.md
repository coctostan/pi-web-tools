---
id: 29
type: bugfix
status: done
created: 2026-05-13T15:45:10.549Z
priority: 2
---
# Update README package metadata, install instructions, and dead repository links
## Problem

`README.md` points to a number of stale or wrong upstream references:

- Line 3: `[Pi coding agent](https://github.com/nicholasgasior/pi-coding-agent)` — that GitHub org/repo no longer hosts pi. The current home is `https://github.com/earendil-works/pi` (umbrella) / `https://github.com/earendil-works/pi-mono` (source).
- Lines 35, 42: `pi install npm:@coctostan/pi-exa-gh-web-tools` and `pi install github:coctostan/pi-web-tools` — the `pi install` syntax has changed across recent pi versions. Verify against current docs and either update the command or note minimum pi version.
- The README still describes the npm package without mention of the scope rename, which can confuse users who install latest pi and see `@earendil-works/pi-coding-agent` as a peer requirement.

## Acceptance criteria

- All references to `nicholasgasior/pi-coding-agent` replaced with `earendil-works/pi` (or `pi-mono` where pointing at source).
- Install instructions verified against the current pi release (`0.74.x`) and corrected; minimum-pi-version note added if helpful.
- Peer-dependency expectations called out (which pi package scope is required at install time).
- "Quick start" still works end-to-end on a fresh machine after the rescope.

## Files likely touched

- `README.md`
- Possibly `package.json` `homepage`/`repository`/`bugs` URLs if those move too (currently they point at `coctostan/pi-web-tools` which is still correct).

## Notes

This issue is documentation-only; it can ship alongside or after the rescope (#kid-026 equivalent).

