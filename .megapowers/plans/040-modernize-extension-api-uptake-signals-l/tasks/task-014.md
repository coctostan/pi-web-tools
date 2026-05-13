---
id: 14
title: Adopt prepareArguments for code_search
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

Wire `normalizeCodeSearchInput` into `code_search.registerTool({...})` as `prepareArguments`. (AC-PREPARE-1, AC-PREPARE-2 for code_search.)

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

Append to `index.test.ts`:

```ts
describe("code_search prepareArguments (#037)", () => {
  it("code_search ToolDefinition exposes prepareArguments and accepts a valid query", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    expect(typeof codeSearchTool.prepareArguments).toBe("function");
    expect(codeSearchTool.prepareArguments({ query: "useState" }).query).toBe("useState");
  });

  it("code_search prepareArguments throws when query is missing", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    expect(() => codeSearchTool.prepareArguments({})).toThrow(/'query' must be provided/);
  });

  it("code_search.execute does not re-normalize", async () => {
    const { codeSearchTool } = await getCodeSearchTool();
    expect(codeSearchTool.execute.toString()).not.toMatch(/normalizeCodeSearchInput/);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run index.test.ts -t "code_search ToolDefinition exposes prepareArguments"`
Expected: FAIL — `expect(typeof codeSearchTool.prepareArguments).toBe("function")` — received "undefined".

**Step 3 — Write minimal implementation**

In `index.ts`, inside `pi.registerTool({ name: "code_search", ... })`, add:

```ts
parameters: CodeSearchParams,
prepareArguments: (raw) => normalizeCodeSearchInput(raw as any) as any,
async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
  const { query, tokensNum } = params as any;
  // ...remainder unchanged
```

Remove the line `const { query, tokensNum } = normalizeCodeSearchInput(params);` (currently line 850).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run index.test.ts -t "code_search ToolDefinition exposes prepareArguments"` etc.
Expected: all PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
