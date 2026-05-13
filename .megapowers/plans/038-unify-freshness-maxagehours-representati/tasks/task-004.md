---
id: 4
title: Clarify realtime freshness documentation
status: approved
depends_on:
  - 1
  - 2
  - 3
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

### Task 4: Clarify realtime freshness documentation [no-test]

**Justification:** Documentation-only change for README wording. Runtime behavior is covered by Tasks 1–3.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**
Update the `web_search` parameter table entry for `freshness` so it explicitly documents the supported public values and clarifies that `"realtime"` means the last 1 hour:

```md
| `freshness` | `string` | `"realtime"` (last 1 hour), `"day"` (24h), `"week"` (168h), or `"any"` (no freshness filter) |
```

Do not document or add a public `maxAgeHours` parameter.

**Step 2 — Verify**
Run: `npm test`
Expected: all passing

Covers: AC 1, AC 2, AC 18.
