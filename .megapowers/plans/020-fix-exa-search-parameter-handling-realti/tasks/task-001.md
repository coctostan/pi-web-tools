---
id: 1
title: "Fix Bug #018 — Change FRESHNESS_MAP `realtime` from 0 to 1"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - tool-params.ts
  - tool-params.test.ts
files_to_create: []
---

Fix `FRESHNESS_MAP` so `"realtime"` maps to `1` (last 1 hour) instead of `0` (which Exa treats as "no filter" — identical to omitting `maxAgeHours` entirely).

**Files:**
- Modify: `tool-params.ts`
- Test: `tool-params.test.ts`

---

**Step 1 — Write the failing test**

The failing test is already present in `tool-params.test.ts` at lines 98–103. Do not add it again — it is reproduced here for reference:

```ts
// tool-params.test.ts — already in file at lines 98-103
it("BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0 (Exa ignores 0 as no-filter)", () => {
  const result = normalizeWebSearchInput({ query: "x", freshness: "realtime" });
  // maxAgeHours: 0 is treated by Exa identically to omitting the field (no filtering).
  // 'realtime' should either be removed from the enum or map to a small positive value.
  expect(result.maxAgeHours).not.toBe(0);
});
```

**Step 2 — Run test, verify it fails**

```
npx vitest run tool-params.test.ts
```

Expected: FAIL — `AssertionError: expected +0 not to be +0 // Object.is equality`

**Step 3 — Write minimal implementation**

**`tool-params.ts` line 11** — change `realtime: 0` to `realtime: 1`:

```ts
const FRESHNESS_MAP: Record<string, number | undefined> = { realtime: 1, day: 24, week: 168, any: undefined };
```

**`tool-params.test.ts` lines 93–96** — update the old test that asserted `0` (it now contradicts the fix; update it to document the new behavior):

```ts
it("normalizeWebSearchInput maps freshness 'realtime' to maxAgeHours 1 (last 1 hour)", () => {
  const result = normalizeWebSearchInput({ query: "x", freshness: "realtime" });
  expect(result.maxAgeHours).toBe(1);
});
```

No other changes needed — the `BUG #018` test at lines 98–103 passes automatically once `FRESHNESS_MAP.realtime` is `1`.

**Step 4 — Run test, verify it passes**

```
npx vitest run tool-params.test.ts
```

Expected: PASS — all tests in `tool-params.test.ts` green.

**Step 5 — Verify no regressions**

```
npm test
```

Expected: all passing.
