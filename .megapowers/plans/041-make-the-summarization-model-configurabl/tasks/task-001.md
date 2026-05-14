---
id: 1
title: Reject malformed filterModel values
status: approved
depends_on: []
no_test: false
files_to_modify:
  - config.ts
  - config.test.ts
files_to_create: []
---

Covers AC 1, AC 2, AC 3, AC 12.

**Files:**
- Modify: `config.ts`
- Test: `config.test.ts`

**Step 1 — Write the failing test**
Add this test in `config.test.ts` near the existing `filterModel` tests:

```ts
  it("ignores malformed filterModel strings", () => {
    for (const value of ["provider/", "/model", "noslash", "", 42, null]) {
      writeFileSync(configPath, JSON.stringify({ filterModel: value }));
      resetConfigCache();
      const config = getConfig();
      expect(config.filterModel).toBeUndefined();
    }
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run config.test.ts -t "ignores malformed filterModel strings"`
Expected: FAIL — `AssertionError: expected 'provider/' to be undefined`

**Step 3 — Write minimal implementation**
In `config.ts`, replace the current `filterModel` parsing block:

```ts
  const filterModel = typeof file["filterModel"] === "string" && file["filterModel"].includes("/")
    ? file["filterModel"]
    : undefined;
```

with:

```ts
  const rawFilterModel = file["filterModel"];
  const filterModel = typeof rawFilterModel === "string" && /^[^/\s]+\/\S.*$/.test(rawFilterModel)
    ? rawFilterModel
    : undefined;
```

This keeps the existing `filterModel` field, requires a non-empty provider before `/`, and requires a non-empty model id after `/`.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run config.test.ts -t "ignores malformed filterModel strings"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
