---
id: 3
title: searchExa defaults to summary mode when detail is omitted
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - exa-search.ts
  - exa-search.test.ts
files_to_create: []
---

### Task 3: searchExa defaults to summary mode when detail is omitted [depends: 1]

**AC covered:** AC 2, AC 3

**Files:**
- Modify: `exa-search.ts`
- Modify: `exa-search.test.ts`

**Step 1 — Write the failing test**

Add to `exa-search.test.ts` inside the `describe("searchExa", ...)` block:

```typescript
it("defaults to summary mode when detail is omitted", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [] }),
  });

  await searchExa("test query", { apiKey: "key" });

  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(body.contents).toEqual({ summary: true });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run exa-search.test.ts -t "defaults to summary mode when detail is omitted"`

Expected: FAIL — `expected { highlights: { numSentences: 3, highlightsPerUrl: 3 } } to deeply equal { summary: true }` — because after Task 1, the default (no `detail`) still sends highlights.

**Step 3 — Write minimal implementation**

In `exa-search.ts`, change the `contents` ternary in `searchExa()` from:

```typescript
contents: options.detail === "summary"
  ? { summary: true }
  : { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
```

to:

```typescript
contents: options.detail === "highlights"
  ? { highlights: { numSentences: 3, highlightsPerUrl: 3 } }
  : { summary: true },
```

Now the default (no `detail` or `detail: "summary"`) sends `{ summary: true }`.

Also update the existing test `"uses highlights content mode with numSentences 3 and highlightsPerUrl 3"` to pass `detail: "highlights"`:

Find this test:
```typescript
it("uses highlights content mode with numSentences 3 and highlightsPerUrl 3", async () => {
```

Change the `searchExa` call from:
```typescript
await searchExa("test", { apiKey: "key" });
```
to:
```typescript
await searchExa("test", { apiKey: "key", detail: "highlights" });
```

Also update the existing test `"sends correct request to Exa API"` — its assertion `expect(body.contents).toEqual({ highlights: { ... } })` needs to change to `expect(body.contents).toEqual({ summary: true })` since it calls without `detail`:

Find:
```typescript
expect(body.contents).toEqual({ highlights: { numSentences: 3, highlightsPerUrl: 3 } });
```
Replace with:
```typescript
expect(body.contents).toEqual({ summary: true });
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run exa-search.test.ts -t "defaults to summary mode when detail is omitted"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: All tests passing.
