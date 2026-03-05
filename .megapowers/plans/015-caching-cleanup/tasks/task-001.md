---
id: 1
title: Create constants.ts with HTTP_FETCH_TIMEOUT_MS and URL_CACHE_TTL_MS
status: approved
depends_on: []
no_test: true
files_to_modify: []
files_to_create:
  - constants.ts
---

**Justification:** Pure value exports — no observable behavior. TypeScript import catches regressions. Covers AC 7 and AC 8.

**Files:**
- Create: `constants.ts`

**Step 1 — Make the change**

Create `constants.ts` in the project root:

```ts
// constants.ts
export const HTTP_FETCH_TIMEOUT_MS = 30_000;
export const URL_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 minutes in milliseconds
```

**Step 2 — Verify**

Run: `npx tsc --noEmit`
Expected: no type errors.

Also verify the values:
- `HTTP_FETCH_TIMEOUT_MS` === 30000 ✓
- `URL_CACHE_TTL_MS` === 1800000 (30 × 60 × 1000) ✓
