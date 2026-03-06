---
id: 1
title: Pass keyword search type through Exa request body
status: approved
depends_on: []
no_test: true
files_to_modify:
  - exa-search.ts
files_to_create: []
---

### Task 1: Pass keyword search type through Exa request body [no-test]

**Justification:** Pure TypeScript type-level change with no runtime behavior change. The existing code at `exa-search.ts:97` already passes through any non-`"auto"` type value to the Exa request body. The existing test "sends type parameter when provided" already covers the passthrough mechanism. Only the type union definition needs updating.
**Files:**
- Modify: `exa-search.ts`
**Step 1 — Update the type definition**

In `exa-search.ts`, change the `ExaSearchOptions` interface `type` field from:

```ts
type?: "auto" | "instant" | "deep";
```

to:

```ts
type?: "auto" | "instant" | "deep" | "keyword";
```

The full updated interface:

```ts
export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  type?: "auto" | "instant" | "deep" | "keyword";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
  detail?: "summary" | "highlights";
  maxAgeHours?: number;
}
```

No other code change is required — the existing passthrough logic handles it:

```ts
if (options.type && options.type !== "auto") {
  requestBody.type = options.type;
}
```

**Step 2 — Verify types compile**
Run: `npx tsc --noEmit`
Expected: no errors

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing
