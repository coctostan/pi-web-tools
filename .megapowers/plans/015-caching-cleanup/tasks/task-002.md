---
id: 2
title: Replace raw 30000 literals in extract.ts with HTTP_FETCH_TIMEOUT_MS
status: approved
depends_on:
  - 1
no_test: true
files_to_modify:
  - extract.ts
files_to_create: []
---

**Justification:** Pure refactor — identical runtime behavior, TypeScript enforces the import. No raw `30000` literal should remain in `extract.ts`. Covers AC 9.

**Files:**
- Modify: `extract.ts`

**Step 1 — Make the change**

Add the import at the top of `extract.ts` (after existing imports):

```ts
import { HTTP_FETCH_TIMEOUT_MS } from "./constants.js";
```

Replace both occurrences of `AbortSignal.timeout(30000)` in `extract.ts`. There are two: one in `extractViaHttp` and one in `extractViaJina`.

In `extractViaHttp` (around line 62–63):
```ts
// BEFORE:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
  : AbortSignal.timeout(30000);

// AFTER:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS)])
  : AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS);
```

In `extractViaJina` (around line 173–175):
```ts
// BEFORE:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
  : AbortSignal.timeout(30000);

// AFTER:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS)])
  : AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS);
```

**Step 2 — Verify**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `grep '30000' extract.ts`
Expected: no output (no raw literal remains).

Run: `npm test`
Expected: all tests pass (behavior unchanged).
