---
id: 7
type: feature
status: open
created: 2026-03-04T21:48:54.255Z
milestone: v2.1
priority: 3
---
# Cleanup pass: dead code, magic numbers, async fs
**Roadmap: 2.1.4** — Code hygiene.

**Scope:**
- Remove `sessionActive` dead code
- Delete or update stale `todo.md`
- Centralize magic numbers into `constants.ts`
- Convert sync fs ops in `github-extract.ts` to async

**Effort:** S (1 hour)
