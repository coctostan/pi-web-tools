---
id: 24
title: Add 4.1.0 changelog section to README
status: approved
depends_on:
  - 23
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

Document the modernization. (AC-BATCH-3) [no-test]

**Justification:** Documentation-only change.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**

Add a `## 4.1.0` section near the top of the changelog area in `README.md` (above the existing `## 4.0.0` section if one exists; otherwise above the first `## ` heading after the intro). Content:

```markdown
## 4.1.0

- **pi-native cancellation**: tool executors now forward the per-call `signal` directly to Exa/extract/filter calls; the manual `pendingFetches` Map and `abortAllPending` helper are gone (~30 lines removed per tool).
- **Smarter `session_start` lifecycle**: branch on `event.reason` — `reload` preserves the URL cache and temp files, `new` starts clean, `fork` restores from `event.previousSessionFile` via the new `restoreFromSessionFile` helper.
- **`prepareArguments` adoption**: all four tools (`web_search`, `fetch_content`, `code_search`, `get_search_content`) wire their `normalize*Input` functions into pi's `ToolDefinition.prepareArguments` hook. `numResults` is now a bounded integer in the visible schema.
- **Compaction-safe result store**: `get_search_content` no longer fails after `/compact`. The session result store is mirrored to `~/.pi/cache/web-tools/results-<sessionId>.json` and rehydrated on `session_start`. Files older than 24h are pruned automatically.
```

**Step 2 — Verify**
Run: `grep -n "## 4.1.0" README.md`
Expected: at least one line printed.
