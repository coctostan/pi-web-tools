---
id: 5
title: Flip all source imports from @mariozechner/* to @earendil-works/*
status: approved
depends_on:
  - 1
  - 2
  - 4
no_test: false
files_to_modify:
  - index.ts
  - filter.ts
files_to_create:
  - scope-rescope.test.ts
---

Addresses **Fixed When #3** (issue #028) source-code half. Pure string substitution across the three import lines in `index.ts` and the two in `filter.ts`. Behavior is unchanged — both scopes expose identical APIs after Tasks 2 and 4. Splitting this from package.json changes (Task 6) keeps the diff focused.

**Files:**
- Modify: `index.ts` (lines 1, 2, 4)
- Modify: `filter.ts` (lines 1, 2)

**Step 1 — Write the failing test**

Add a build-time guardrail test that scans the source tree for legacy imports. Create `scope-rescope.test.ts` in the repo root:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function listSourceTs(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".pi" || entry === ".git" || entry === ".worktrees") continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) listSourceTs(full, acc);
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

describe("npm scope rescope", () => {
  it("no source .ts file imports from @mariozechner/*", () => {
    const offenders: string[] = [];
    for (const file of listSourceTs(".")) {
      const src = readFileSync(file, "utf8");
      if (/from\s+["']@mariozechner\//.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run scope-rescope.test.ts`

Expected: FAIL — `AssertionError: expected [ './index.ts', './filter.ts' ] to deeply equal []`.

**Step 3 — Write minimal implementation**

In `index.ts` lines 1, 2, 4, replace exactly:

```ts
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
// ...
import { complete } from "@mariozechner/pi-ai";
```

with:

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
// ...
import { complete } from "@earendil-works/pi-ai";
```

In `filter.ts` lines 1–2, replace:

```ts
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@mariozechner/pi-ai";
```

with:

```ts
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@earendil-works/pi-ai";
```

Verify with:

```bash
grep -nR '@mariozechner' --include='*.ts' . | grep -v node_modules | grep -v '.pi/npm'
```

Expected output: empty.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run scope-rescope.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npm run build && npm test`

Expected:
- `npm run build` succeeds (TypeScript compiles against `@earendil-works/pi-coding-agent@0.74.0` types — the migrations in Tasks 2 and 4 mean `getApiKey` and `session_switch`/`session_fork` references are already gone)
- `npm test` all passing.
