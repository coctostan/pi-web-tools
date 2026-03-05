---
id: 4
title: parseExaResults maps summary field to snippet
status: approved
depends_on: []
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

### Task 4: parseExaResults maps summary field to snippet

**AC covered:** AC 4, AC 5, AC 7
**Files:**
- Modify: `exa-search.ts`
- Test: `exa-search.test.ts`
**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("searchExa", ...)` block (we test through `searchExa` since `parseExaResults` is not exported):

```typescript
it("maps snippet fallback order summary -> highlights -> text -> empty string", async () => {
  // summary case
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Summary Result",
          url: "https://example.com/summary",
          summary: "A concise one-line summary of the page.",
        },
      ],
    }),
  });
  let results = await searchExa("test", { apiKey: "key" });
  expect(results).toHaveLength(1);
  expect(results[0].snippet).toBe("A concise one-line summary of the page.");
  // highlights fallback case
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Highlights Result",
          url: "https://example.com/highlights",
          highlights: ["Sentence one.", "Sentence two."],
        },
      ],
    }),
  });
  results = await searchExa("test", { apiKey: "key", detail: "highlights" });
  expect(results[0].snippet).toBe("Sentence one. Sentence two.");

  // text fallback case
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Text Result",
          url: "https://example.com/text",
          text: "Raw text fallback",
        },
      ],
    }),
  });
  results = await searchExa("test", { apiKey: "key" });
  expect(results[0].snippet).toBe("Raw text fallback");

  // empty fallback case (title + url only)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: [
        {
          title: "Bare Result",
          url: "https://example.com/bare",
        },
      ],
    }),
  });
  results = await searchExa("test", { apiKey: "key" });
  expect(results[0].snippet).toBe("");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-search.test.ts -t "maps snippet fallback order summary -> highlights -> text -> empty string"`

Expected: FAIL — `expected '' to be 'A concise one-line summary of the page.'` because `parseExaResults` currently ignores `summary`.

**Step 3 — Write minimal implementation**

In `exa-search.ts`:

1. Add `summary` to `ExaRawResult`:

```typescript
type ExaRawResult = {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  highlights?: unknown;
  summary?: unknown;
  publishedDate?: unknown;
};
```

2. In `parseExaResults`, update snippet fallback order to:

```typescript
snippet: (() => {
  if (typeof r.summary === "string" && r.summary) return r.summary;
  if (Array.isArray(r.highlights)) {
    const joined = r.highlights.filter((h): h is string => typeof h === "string").join(" ");
    if (joined) return joined;
  }
  if (typeof r.text === "string") return r.text;
  return "";
})(),
```

This explicitly locks compatibility fallback as `summary -> highlights -> text -> ""` (AC5 and AC7 included here).

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "maps snippet fallback order summary -> highlights -> text -> empty string"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing. Fallback compatibility remains covered here; Tasks 5 and 6 are verification-only.
