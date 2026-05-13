---
id: 13
title: Adopt prepareArguments for fetch_content
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Wire `normalizeFetchContentInput` into `fetch_content.registerTool({...})` as `prepareArguments`. (AC-PREPARE-1, AC-PREPARE-2, AC-PREPARE-5.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
describe("fetch_content prepareArguments (#037)", () => {
  it("fetch_content ToolDefinition exposes prepareArguments that normalizes url -> urls[]", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    expect(typeof fetchContentTool.prepareArguments).toBe("function");
    const normalized = fetchContentTool.prepareArguments({ url: "https://example.com" });
    expect(normalized.urls).toEqual(["https://example.com"]);
  });

  it("fetch_content prepareArguments throws the documented error when neither url nor urls is provided (AC-PREPARE-5)", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    expect(() => fetchContentTool.prepareArguments({})).toThrow(/Either 'url' or 'urls' must be provided/);
  });

  it("fetch_content.execute does not re-normalize", async () => {
    const { fetchContentTool } = await getFetchContentTool();
    expect(fetchContentTool.execute.toString()).not.toMatch(/normalizeFetchContentInput/);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "fetch_content ToolDefinition exposes prepareArguments"`
Expected: FAIL — `expect(typeof fetchContentTool.prepareArguments).toBe("function")` — received "undefined".

**Step 3 — Write minimal implementation**

In `index.ts`, inside `pi.registerTool({ name: "fetch_content", ... })`, add:

```ts
parameters: FetchContentParams,
prepareArguments: (raw) => normalizeFetchContentInput(raw as any) as any,
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  const { urls: dedupedUrls, forceClone, prompt, noCache } = params as any;
  // ...remainder unchanged
```

Remove the line `const { urls: dedupedUrls, forceClone, prompt, noCache } = normalizeFetchContentInput(params);` (currently line 446).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "fetch_content ToolDefinition exposes prepareArguments"` and `-t "fetch_content prepareArguments throws the documented error"` and `-t "fetch_content.execute does not re-normalize"`
Expected: all PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
