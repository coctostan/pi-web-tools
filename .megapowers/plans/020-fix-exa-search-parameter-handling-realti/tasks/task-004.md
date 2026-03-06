---
id: 4
title: Update README to document corrected `realtime` freshness value and
  `similarUrl` filter support
status: approved
depends_on:
  - 1
  - 3
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

Documentation-only task. Update the `README.md` to reflect:
1. `freshness: "realtime"` now maps to `maxAgeHours: 1` (last 1 hour) — not `0h` as previously documented.
2. `similarUrl` supports `includeDomains` and `excludeDomains` but NOT `freshness` or `category`; using the latter two will produce a warning note.

**Justification:** documentation — no observable behavior change, pure doc update to match the fixes in Tasks 1 and 3.

**Files:**
- Modify: `README.md`

---

**Step 1 — Make the change**

**`README.md` line 90** — update the `freshness` table row to correct `"realtime"` description from `0h` to `last 1 hour`:

Old:
```
| `freshness` | string | `"realtime"`, `"day"`, `"week"`, or `"any"` (default) |
```

New:
```
| `freshness` | string | `"realtime"` (last 1 hour), `"day"` (last 24h), `"week"` (last 168h), or `"any"` (default, no filter) |
```

**`README.md` line 94** — update the `similarUrl` table row to document supported/unsupported filters:

Old:
```
| `similarUrl` | string | Find pages similar to this URL (alternative to `query`) |
```

New:
```
| `similarUrl` | string | Find pages similar to this URL (alternative to `query`). Supports `includeDomains` and `excludeDomains`. Note: `freshness` and `category` are not supported and will produce a warning. |
```

**Step 2 — Verify**

```
npm test
```

Expected: all passing (no test changes, just documentation).
