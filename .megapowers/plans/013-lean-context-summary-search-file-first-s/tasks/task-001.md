---
id: 1
title: searchExa sends summary contents when detail is "summary"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

### Task 1: searchExa sends summary contents when detail is "summary"

**AC covered:** AC 1
**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`
**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("searchExa", ...)` block:

```typescript
it("sends contents.summary when detail is 'summary'", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test query", { apiKey: "key", detail: "summary" });
  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.contents).toEqual({ summary: true });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-search.test.ts -t "sends contents.summary when detail is 'summary'"`

Expected: FAIL — `expected { highlights: { numSentences: 3, highlightsPerUrl: 3 } } to deeply equal { summary: true }`

**Step 3 — Write minimal implementation**

In `exa-search.ts`:

1. Add `detail` to `ExaSearchOptions`:

```typescript
export interface ExaSearchOptions {
  apiKey: string | null;
  numResults?: number;
  type?: "auto" | "instant" | "deep";
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
  detail?: "summary" | "highlights";
}
```

2. In `searchExa()`, change request `contents` from:

```typescript
contents: { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
```

to:

```typescript
contents: options.detail === "summary"
  ? { summary: true }
  : { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "sends contents.summary when detail is 'summary'"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.
