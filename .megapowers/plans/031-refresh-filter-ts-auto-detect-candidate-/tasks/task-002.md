---
id: 2
title: Update README default filter model
status: approved
depends_on:
  - 1
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

Covers AC 15-16.

**Justification:** Documentation-only change. Behavior is covered by Task 1; this task updates the documented config example to match the first auto-detect candidate.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**
In `README.md`, update the full config example so the `filterModel` line reads:

```json
  "filterModel": "anthropic-cc/claude-haiku-4-5",
```

Do not change `config.ts`; it currently defaults `filterModel` to `undefined` and contains no default-model string that needs updating.

**Step 2 — Verify**
Run: `npm test`
Expected: all passing

Also verify by inspection that `README.md` no longer documents `anthropic/claude-haiku-4-5` as the config example default, and instead documents `anthropic-cc/claude-haiku-4-5`.
