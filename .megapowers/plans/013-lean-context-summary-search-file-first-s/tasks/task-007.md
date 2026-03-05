---
id: 7
title: formatSearchResults does not truncate summary snippets
status: approved
depends_on: []
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

### Task 7: formatSearchResults does not truncate summary snippets

**AC covered:** AC 6
**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`
**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("formatSearchResults", ...)` block:

```typescript
it("does not truncate summary snippet even when over 200 chars", () => {
  const summary = "S".repeat(260);
  const results: ExaSearchResult[] = [
    { title: "Summary Page", url: "https://example.com/page", snippet: summary },
  ];

  const output = formatSearchResults(results);
  expect(output).toContain(summary);
  expect(output).not.toContain("…");
  });
```

**Step 2 — Run test, verify it fails**

  Run: `npx vitest run exa-search.test.ts -t "does not truncate summary snippet even when over 200 chars"`

Expected: FAIL — `expected '...'(formatted output) not to contain '…'`

**Step 3 — Write minimal implementation**

In `exa-search.ts`, inside `formatSearchResults`, replace:

```typescript
const preview = r.snippet.length > 200 ? r.snippet.slice(0, 200) + "…" : r.snippet;
parts.push(`   ${preview}`);
```

with:

```typescript
parts.push(`   ${r.snippet}`);
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "does not truncate summary snippet even when over 200 chars"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.
