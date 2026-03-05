---
id: 18
title: fetch_content returns inline with warning when temp file write fails
status: approved
depends_on:
  - 11
  - 13
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

### Task 18: fetch_content returns inline with warning when temp file write fails [depends: 11, 13]

**AC covered:** AC 21
**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`
**Step 1 — Write the failing test (multi-URL raw failure fallback)**

Add to `describe("fetch_content file-first storage", ...)` in `index.test.ts`:

```typescript
it("returns warning + inline preview for failed file writes in multi-url raw mode", async () => {
  state.extractContent.mockImplementation(async (url: string) => {
    if (url === "https://a.example/page") {
      return { url, title: "Page A", content: "A".repeat(1200), error: null };
    }
    return { url, title: "Page B", content: "B".repeat(1200), error: null };
  });

  offloadState.offloadToFile.mockImplementation((text: string) => {
    if (text.includes("# Page B")) {
      throw new Error("ENOSPC");
    }
    return "/tmp/pi-web-page-a.txt";
  });
  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
  const result = await fetchContentTool.execute(
    "call-multi-write-fail",
    { urls: ["https://a.example/page", "https://b.example/page"] },
    undefined,
    undefined,
    ctx
  );
  const text = getText(result);
  expect(text).toContain("/tmp/pi-web-page-a.txt");
  expect(text).toContain("⚠ Could not write temp file. Returning inline.");
  expect(text).toContain("Preview: # Page B");
  expect(text).not.toContain("Page B — could not write temp file");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "returns warning + inline preview for failed file writes in multi-url raw mode"`

Expected: FAIL — `expected text to contain "⚠ Could not write temp file. Returning inline."`

**Step 3 — Write minimal implementation**

In `index.ts`, update Task 13’s multi-URL raw loop catch block.

Replace:

```typescript
lines.push(`${i + 1}. ⚠ ${r.title} — could not write temp file`);
lines.push(`   ${r.url}`);
continue;
```

with inline-warning preview fallback:

```typescript
lines.push(`${i + 1}. ⚠ ${r.title}`);
lines.push(`   ${r.url}`);
lines.push("   ⚠ Could not write temp file. Returning inline.");
const inlinePreview = fullText.slice(0, FILE_FIRST_PREVIEW_SIZE);
lines.push(`   Preview: ${inlinePreview}${fullText.length > FILE_FIRST_PREVIEW_SIZE ? "..." : ""}`);
lines.push("");
continue;
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts -t "returns warning + inline preview for failed file writes in multi-url raw mode"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.
