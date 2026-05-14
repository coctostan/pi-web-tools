---
id: 3
title: Remove pdf-parse from dependencies and lockfile
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - package.json
  - package-lock.json
files_to_create: []
---

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `package.test.ts` (new — but kept here under modify because it's tiny; if a test file doesn't exist, create it under the project root next to other `*.test.ts` files)
- Create: `dependencies.test.ts`

**Step 1 — Write the failing test**

Create `dependencies.test.ts` at the repo root (same directory as `extract.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "package.json"), "utf-8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("package.json dependency hygiene", () => {
  it("does not depend on the unmaintained pdf-parse package", () => {
    expect(pkg.dependencies?.["pdf-parse"]).toBeUndefined();
    expect(pkg.devDependencies?.["pdf-parse"]).toBeUndefined();
  });

  it("declares unpdf as a runtime dependency", () => {
    expect(pkg.dependencies?.["unpdf"]).toBeDefined();
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run dependencies.test.ts`

Expected: FAIL — `AssertionError: expected '^2.4.5' to be undefined` on the first assertion (because `package.json` still has `"pdf-parse": "^2.4.5"`).

**Step 3 — Write minimal implementation**

Run from the repo root:

```
npm uninstall pdf-parse
```

This removes `"pdf-parse"` from `package.json` `dependencies` and removes the `node_modules/pdf-parse` entry from `package-lock.json`.

Manually verify after the command:
- `package.json` `dependencies` no longer contains `"pdf-parse"`.
- `package-lock.json` has no `"node_modules/pdf-parse"` entry (search for `pdf-parse` — only matches should be transitive `<none>` or absent).
- `unpdf` is still present in `dependencies` (added by Task 1).

**Step 4 — Run test, verify it passes**

Run: `npx vitest run dependencies.test.ts`

Expected: PASS — both `pdf-parse` is gone and `unpdf` is declared.

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all 28 tests passing (26 prior + 2 new dependency-hygiene tests).

Also run: `npm ls pdf-parse`

Expected: `(empty)` or exit code 1 with no `pdf-parse` in the tree — confirms removal at the install level.
