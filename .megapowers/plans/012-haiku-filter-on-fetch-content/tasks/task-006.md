---
id: 6
title: filterContent handles empty/short responses with fallback
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - filter.ts
  - filter.test.ts
files_to_create: []
---

### Task 6: filterContent handles empty/short responses with fallback [depends: 4]

**Files:**
- Modify: `filter.ts`
- Modify: `filter.test.ts`

**Step 1 — Write the failing test**

Add to `filter.test.ts` inside the `filterContent` describe block:

```typescript
it("returns fallback when filter response is too short (< 20 chars)", async () => {
  const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
  const mockRegistry = {
    find: vi.fn().mockReturnValue(mockModel),
    getApiKey: vi.fn().mockResolvedValue("test-key"),
  };

  const mockComplete = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "OK" }],
  });

  const result = await filterContent(
    "Some page content here",
    "What is this about?",
    mockRegistry as any,
    undefined,
    mockComplete
  );

  expect(result).toEqual({ filtered: null, reason: "Filter response too short (2 chars)" });
});

it("returns fallback when filter response is empty", async () => {
  const mockModel = { id: "claude-haiku-4-5", provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" };
  const mockRegistry = {
    find: vi.fn().mockReturnValue(mockModel),
    getApiKey: vi.fn().mockResolvedValue("test-key"),
  };

  const mockComplete = vi.fn().mockResolvedValue({
    content: [],
  });

  const result = await filterContent(
    "Some page content here",
    "What is this about?",
    mockRegistry as any,
    undefined,
    mockComplete
  );

  expect(result).toEqual({ filtered: null, reason: "Filter response too short (0 chars)" });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — the short response test fails because `filterContent` currently returns `{ filtered: "OK", model: "anthropic/claude-haiku-4-5" }` instead of a fallback.

**Step 3 — Write minimal implementation**

Add a length check after extracting the answer text in `filterContent`, before the success return:

```typescript
const MIN_FILTER_RESPONSE_LENGTH = 20;

// Inside filterContent, after extracting `answer`:
if (answer.length < MIN_FILTER_RESPONSE_LENGTH) {
  return { filtered: null, reason: `Filter response too short (${answer.length} chars)` };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing
