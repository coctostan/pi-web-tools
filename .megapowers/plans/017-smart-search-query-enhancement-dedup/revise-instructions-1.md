# Revision Instructions — Plan Iteration 1

## Task 1: Pass keyword search type through Exa request body

**Problem:** The TDD red step will not be red. The existing code at `exa-search.ts:97` already passes through any non-`"auto"` type at runtime:

```ts
if (options.type && options.type !== "auto") {
  requestBody.type = options.type;
}
```

Using `type: "keyword" as any` bypasses TypeScript type checking, and at runtime `"keyword"` flows through. The test passes immediately without any code change.

**Fix:** Convert this task to `no-test: true`. The task's real value is a TypeScript type definition change. Replace the 5-step TDD flow with:

1. Add `"keyword"` to the `ExaSearchOptions.type` union in `exa-search.ts`
2. Verify with: `npx tsc --noEmit`
3. Verify no regressions: `npm test`

The justification for no-test is: this is a pure type-level change with no runtime behavior change; the existing test "sends type parameter when provided" already covers the passthrough mechanism.

---

## Task 3: Add result dedup and snippet cleanup post-processing

### Issue 1: Breadcrumb regex uses wrong quantifier

**Problem:** In the `cleanSnippet` function, the regex uses `[^.]*?` (non-greedy):

```ts
cleaned = cleaned.replace(/^\s*(?:[^>\n]+\s>\s){2,}[^.]*?\.?\s*/i, "");
```

For the test input `"Docs > API > fetch_content Last updated Jan 15, 2026. Returns the fetched page."`, the non-greedy `[^.]*?` matches zero characters, so only `"Docs > API > "` is stripped. After the Last Updated strip, the result is `"fetch_content Returns the fetched page."` — but the test asserts `"Returns the fetched page."`.

**Fix:** Change `[^.]*?` to `[^.]*` (greedy):

```ts
cleaned = cleaned.replace(/^\s*(?:[^>\n]+\s>\s){2,}[^.]*\.?\s*/i, "");
```

With the greedy version, `[^.]*` matches `"fetch_content Last updated Jan 15, 2026"`, then `\.?` matches `"."`, then `\s*` matches the trailing space. The remaining text is `"Returns the fetched page."` which matches the test assertion.

### Issue 2: Step 1 import placement creates invalid syntax

**Problem:** Step 1 says "append this block below the `enhanceQuery` tests" but the code block starts with `import` declarations. ES module `import` statements cannot appear mid-file — this creates a parse error, meaning Step 2 will fail with a syntax error instead of the expected module export error.

**Fix:** Rewrite Step 1 to have two parts:
1. **At the top of `smart-search.test.ts`**, change the import line from:
   ```ts
   import { enhanceQuery } from "./smart-search.js";
   ```
   to:
   ```ts
   import { enhanceQuery, postProcessResults } from "./smart-search.js";
   import type { ExaSearchResult } from "./exa-search.js";
   ```
2. **Below the `enhanceQuery` describe block**, append only the `describe("postProcessResults", ...)` block (without the import lines).

Then remove the separate "update the import line" instruction from Step 3 since it's now handled in Step 1.

The Step 2 expected error should remain: `Module '"./smart-search.js"' has no exported member 'postProcessResults'` (the function isn't exported yet).
