---
id: 9
title: "Update README: fix dead link, add pi 0.74 note, document snapshot
  refresh, 4.0.0 changelog"
status: approved
depends_on:
  - 6
  - 7
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

**Justification:** Documentation-only. Addresses **Fixed When #4** (issue #029) plus the snapshot-refresh documentation requirement from **Fixed When #5** (issue #030).

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**

Apply the following edits to `README.md`:

1. **Line 3** — replace:
   `[Pi coding agent](https://github.com/nicholasgasior/pi-coding-agent)`
   with:
   `[Pi coding agent](https://github.com/earendil-works/pi-mono)`

2. **Insert a Requirements section** just before the "Quick start" heading (currently around line 29). Add:

   ```markdown
   ## Requirements

   - Pi coding agent ≥ `0.74.0` (npm scope `@earendil-works/*`)
   - Node.js ≥ 22

   `pi-web-tools` declares `peerDependencies` on `@earendil-works/pi-coding-agent ^0.74.0` and `@earendil-works/pi-tui ^0.74.0`. The legacy `@mariozechner/*` scope is no longer supported — if you are on pi `< 0.74`, stay on `pi-web-tools@3.x`.
   ```

3. **Install commands** (currently around lines 35, 42) — leave the `pi install` commands as-is but add a one-line note immediately above them:

   `> Requires pi 0.74 or newer.`

4. **Development section** — find the existing "Development" heading and append a subsection after the existing `npm install` / `npm test` / `pi -e ./index.ts` instructions:

   ```markdown
   ### Refresh the vendored pi snapshot

   The repo vendors a minimal `node_modules/` snapshot under `.pi/npm/` so that
   `pi -e ./index.ts` runs against a pinned coding-agent build. To refresh it
   after a pi release:

       rm -rf .pi/npm/node_modules .pi/npm/package-lock.json
       (cd .pi/npm && npm install)
       npx tsx scripts/smoke-load-extension.mjs

   Commit the resulting `.pi/npm/package.json`, `.pi/npm/package-lock.json`, and
   `.pi/npm/node_modules/` tree.
   ```

5. **Changelog** — find the `## Changelog` section and prepend a new entry above the existing `### 3.0.0` block:

   ```markdown
   ### 4.0.0

   - **Breaking:** requires pi `0.74.0+` and the `@earendil-works/*` npm scope. Users on older pi must stay on `pi-web-tools@3.x`.
   - migrated to `ModelRegistry.getApiKeyAndHeaders` and threads custom auth headers (Anthropic OAuth, Cloudflare AI Gateway, Xiaomi) through to the filter model
   - migrated session lifecycle to the consolidated `session_start{reason}` event; `reload` no longer wipes the URL cache or temp files
   - refreshed vendored `.pi/npm` extension snapshot to `@earendil-works/pi-coding-agent@^0.74.0`
   ```

**Step 2 — Verify**

Run:

```bash
grep -n 'nicholasgasior' README.md
grep -n '@earendil-works' README.md
grep -n '4.0.0' README.md
grep -n 'scripts/smoke-load-extension' README.md
```

Expected:
- First grep returns no matches (exit code 1)
- Second grep returns ≥ 2 matches (Requirements section + Changelog)
- Third grep returns ≥ 1 match (Changelog entry)
- Fourth grep returns ≥ 1 match (Development section)

Also verify the Quick start install commands still parse cleanly by reading lines 35–45 manually — no broken markdown.
