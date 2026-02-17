# Fix: web_search Missing Response ID in Text Output

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Surface the `searchId` in `web_search`'s text output so models can use `get_search_content` to retrieve full results.

**Architecture:** Two small changes in `index.ts`: (1) append a retrieval hint line to the text output, (2) rename `searchId` to `responseId` in the details object for naming consistency with `get_search_content`.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Write failing test for responseId in web_search text output

Since `index.ts` requires the full pi runtime and can't be unit-tested directly (the existing `index.test.ts` only tests isolated helper functions), we'll add a focused test for the output formatting logic. We'll extract the formatting into a testable function.

Actually — looking at the codebase, the formatting is inline in the execute handler and can't be called in isolation. The simplest correct fix is to modify `index.ts` directly and verify manually, since the change is a one-line text append and a field rename.

But we can write a test that validates the pattern: a regex test against the expected output format, using a helper that mimics the formatting logic.

**Files:**
- Create: `web-search-output.test.ts`

**Step 1: Write the failing test**

```typescript
// web-search-output.test.ts
import { describe, it, expect } from "vitest";

/**
 * Reproduces the web_search output formatting logic from index.ts.
 * Tests that the searchId/responseId appears in the text output.
 */
function formatWebSearchOutput(
  results: Array<{ query: string; answer: string; error: string | null }>,
  searchId: string
): string {
  const textParts: string[] = [];
  for (const r of results) {
    textParts.push(`## Query: ${r.query}`);
    if (r.error) {
      textParts.push(`Error: ${r.error}`);
    } else {
      textParts.push(r.answer);
    }
    textParts.push("");
  }
  // BUG: searchId is NOT included in text output today
  // This test should FAIL until we fix index.ts
  return textParts.join("\n");
}

describe("web_search output formatting", () => {
  it("includes responseId in text output", () => {
    const results = [
      { query: "test query", answer: "some answer", error: null },
    ];
    const output = formatWebSearchOutput(results, "abc123");
    expect(output).toContain("abc123");
    expect(output).toContain("get_search_content");
    expect(output).toContain("responseId");
  });

  it("includes responseId even when all queries error", () => {
    const results = [
      { query: "bad query", answer: "", error: "API error" },
    ];
    const output = formatWebSearchOutput(results, "xyz789");
    expect(output).toContain("xyz789");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run web-search-output.test.ts`
Expected: FAIL — the `formatWebSearchOutput` function doesn't include `searchId` in output (reproducing the bug)

**Step 3: Commit**

```bash
git add web-search-output.test.ts
git commit -m "test: add failing tests for web_search missing responseId"
```

---

### Task 2: Fix the formatting function and make tests pass

**Files:**
- Modify: `web-search-output.test.ts`

**Step 1: Fix the test helper to include the responseId**

Update `formatWebSearchOutput` in `web-search-output.test.ts` to append the retrieval hint — this is the pattern we'll then apply to `index.ts`:

```typescript
function formatWebSearchOutput(
  results: Array<{ query: string; answer: string; error: string | null }>,
  searchId: string
): string {
  const textParts: string[] = [];
  for (const r of results) {
    textParts.push(`## Query: ${r.query}`);
    if (r.error) {
      textParts.push(`Error: ${r.error}`);
    } else {
      textParts.push(r.answer);
    }
    textParts.push("");
  }
  textParts.push(`Use get_search_content with responseId "${searchId}" and query/queryIndex to retrieve full content.`);
  return textParts.join("\n");
}
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run web-search-output.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add web-search-output.test.ts
git commit -m "test: fix formatting helper to include responseId (green)"
```

---

### Task 3: Apply the fix to index.ts

**Files:**
- Modify: `index.ts:207-222` (web_search execute handler, formatting + return block)

**Step 1: Add responseId to text output**

In `index.ts`, find this block (around line 207):

```typescript
        // Format output text
        const textParts: string[] = [];
        for (const r of results) {
          textParts.push(`## Query: ${r.query}`);
          if (r.error) {
            textParts.push(`Error: ${r.error}`);
          } else {
            textParts.push(r.answer);
          }
          textParts.push("");
        }
```

Add after the for-loop, before the return:

```typescript
        textParts.push(`Use get_search_content with responseId "${searchId}" and query/queryIndex to retrieve full content.`);
```

**Step 2: Rename searchId to responseId in details**

In the same return block, change:

```typescript
        return {
          content: [{ type: "text", text: textParts.join("\n") }],
          details: {
            queryCount: queryList.length,
            successfulQueries,
            totalResults,
            searchId,
          },
        };
```

To:

```typescript
        return {
          content: [{ type: "text", text: textParts.join("\n") }],
          details: {
            queryCount: queryList.length,
            successfulQueries,
            totalResults,
            responseId: searchId,
          },
        };
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add index.ts
git commit -m "fix: surface responseId in web_search text output"
```

---

### Task 4: Clean up — remove standalone test file

The `web-search-output.test.ts` test was a scaffold to drive the fix via TDD. Since it tests a local copy of the formatting logic (not the actual `index.ts` code), it will drift and become misleading. Remove it.

**Files:**
- Delete: `web-search-output.test.ts`

**Step 1: Delete the test file**

```bash
rm web-search-output.test.ts
```

**Step 2: Run all tests to confirm nothing broke**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove scaffold test for responseId fix"
```

---

### Task 5: Update bug report and verify

**Files:**
- Modify: `bugs/web-search-missing-response-id.md`

**Step 1: Add resolution note to bug report**

Append to the end of the bug file:

```markdown

## Resolution

Fixed in branch `fix/web-search-missing-response-id`:
- Added `responseId` to `web_search` text output with retrieval hint
- Renamed `searchId` → `responseId` in details object for consistency
```

**Step 2: Final test run**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add bugs/web-search-missing-response-id.md
git commit -m "docs: mark web-search responseId bug as resolved"
```
