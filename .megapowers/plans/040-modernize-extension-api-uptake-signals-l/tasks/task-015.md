---
id: 15
title: Adopt prepareArguments for get_search_content
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Wire `normalizeGetSearchContentInput` into `get_search_content.registerTool({...})` as `prepareArguments`. (AC-PREPARE-1, AC-PREPARE-2 for get_search_content.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
describe("get_search_content prepareArguments (#037)", () => {
  it("get_search_content ToolDefinition exposes prepareArguments", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    expect(typeof getSearchContentTool.prepareArguments).toBe("function");
    expect(getSearchContentTool.prepareArguments({ responseId: "abc" }).responseId).toBe("abc");
  });

  it("get_search_content prepareArguments throws when responseId missing", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    expect(() => getSearchContentTool.prepareArguments({})).toThrow(/'responseId' must be provided/);
  });

  it("get_search_content.execute does not re-normalize", async () => {
    const { getSearchContentTool } = await getFetchAndGetSearchContentTools();
    expect(getSearchContentTool.execute.toString()).not.toMatch(/normalizeGetSearchContentInput/);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "get_search_content ToolDefinition exposes prepareArguments"`
Expected: FAIL — received "undefined".

**Step 3 — Write minimal implementation**

In `index.ts`, inside `pi.registerTool({ name: "get_search_content", ... })`, add:

```ts
parameters: GetSearchContentParams,
prepareArguments: (raw) => normalizeGetSearchContentInput(raw as any) as any,
async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
  if (signal?.aborted) {
    return {
      content: [{ type: "text" as const, text: "Operation aborted." }],
      isError: true,
    };
  }

  const { responseId, query, queryIndex, url, urlIndex, maxChars } = params as any;
  // ...remainder unchanged
}
```

Remove the line `const { responseId, query, queryIndex, url, urlIndex, maxChars } = normalizeGetSearchContentInput(params);` (currently line 980).

**Step 4 — Run tests, verify they pass**
Run: `npx vitest run index.test.ts -t "get_search_content ToolDefinition exposes prepareArguments"` etc.
Expected: all PASS

Also rerun the Task 4 cancellation test to ensure the `prepareArguments` change preserved the early abort branch:
Run: `npx vitest run index.test.ts -t "returns an aborted result when execute\\(\\) receives an already-aborted signal"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
