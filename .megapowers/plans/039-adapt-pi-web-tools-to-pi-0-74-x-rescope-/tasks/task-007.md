---
id: 7
title: Refresh .pi/npm vendored snapshot to @earendil-works/* 0.74
status: approved
depends_on:
  - 6
no_test: true
files_to_modify:
  - .pi/npm/package.json
  - .pi/npm/package-lock.json
files_to_create: []
---

**Justification:** This is a vendored `node_modules/` snapshot regeneration — there is no unit-test surface inside the snapshot itself. The associated regression is exercised by Task 8's smoke test (`pi -e ./index.ts` loads four tools). Addresses **Fixed When #5** (issue #030).

Current `.pi/npm/package.json` only declares `pi-hooks` and `pi-provider-kimi-code`. The legacy `@mariozechner/pi-coding-agent@0.73.0` is present in `.pi/npm/node_modules/` as a transitive of those — meaning `pi -e ./index.ts` resolves the legacy ABI silently. We make the dependency explicit on the new scope so the snapshot is reproducible.

**Files:**
- Modify: `.pi/npm/package.json` (add @earendil-works/* deps explicitly)
- Modify: `.pi/npm/package-lock.json` (regenerated)
- Remove: `.pi/npm/node_modules/@mariozechner/` (entire scope dir)

**Step 1 — Make the change**

Replace `.pi/npm/package.json` content with:

```json
{
  "name": "pi-extensions",
  "private": true,
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^0.74.0",
    "@earendil-works/pi-tui": "^0.74.0",
    "pi-hooks": "^1.0.4",
    "pi-provider-kimi-code": "^0.3.0"
  }
}
```

Regenerate from a clean state:

```bash
rm -rf .pi/npm/node_modules .pi/npm/package-lock.json
cd .pi/npm && npm install && cd ../..
```

Sanity-check the resulting layout — the legacy scope should be entirely gone:

```bash
ls .pi/npm/node_modules/@earendil-works/
test ! -d .pi/npm/node_modules/@mariozechner && echo "legacy scope absent" || echo "FAIL: legacy still present"
node -e 'console.log(require("./.pi/npm/node_modules/@earendil-works/pi-coding-agent/package.json").version)'
node -e 'console.log(require("./.pi/npm/node_modules/@earendil-works/pi-tui/package.json").version)'
```

If the legacy scope still appears (e.g. as a transitive of `pi-hooks` or `pi-provider-kimi-code`), document that and leave it in place — the explicit `@earendil-works/*` entries are what `pi -e` will resolve. Otherwise it must be absent.

Commit `.pi/npm/package.json` and `.pi/npm/package-lock.json`. The `.pi/npm/node_modules/**` tree is already tracked in this repo (see `git status` — `.pi/npm/` is not in `.gitignore`).

**Step 2 — Verify**

Run:

```bash
node -e 'const p=require("./.pi/npm/node_modules/@earendil-works/pi-coding-agent/package.json"); if(!/^0\.74/.test(p.version)) process.exit(1); console.log("ok",p.version)'
node -e 'const p=require("./.pi/npm/node_modules/@earendil-works/pi-tui/package.json"); if(!/^0\.74/.test(p.version)) process.exit(1); console.log("ok",p.version)'
npm test 2>&1 | tail -3
```

Expected:
- Both `ok 0.74.x` prints succeed
- Full vitest suite still passes (the snapshot refresh does not affect vitest, which uses the root `node_modules/`)
