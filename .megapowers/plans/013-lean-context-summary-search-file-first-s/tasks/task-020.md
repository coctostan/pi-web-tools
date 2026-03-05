---
id: 20
title: tool_result interceptor remains unchanged for
  code_search/get_search_content offloading
status: approved
depends_on:
  - 11
no_test: false
files_to_modify:
  - index.test.ts
files_to_create: []
---

### Task 20: tool_result interceptor remains unchanged for code_search/get_search_content offloading [depends: 11]

**AC covered:** AC 20
**Files:**
- Test: `index.test.ts`
**Step 1 — Write the regression test (reuse existing offloadState mock)**

Do **not** redeclare `offloadState`. Reuse the one introduced earlier in `index.test.ts` and add this test:

```typescript
async function getToolResultHandler() {
  vi.resetModules();
  const handlers = new Map<string, any>();
  const pi = {
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  const handler = handlers.get("tool_result");
  if (!handler) throw new Error("tool_result handler not registered");
  return handler;
}
it("offloads large code_search/get_search_content results and leaves small ones unchanged", async () => {
  const handler = await getToolResultHandler();
  offloadState.shouldOffload.mockReturnValueOnce(true);
  offloadState.offloadToFile.mockReturnValueOnce("/tmp/pi-web-large.txt");
  offloadState.buildOffloadResult.mockReturnValueOnce("preview + file path");
  const largeIntercept = await handler({
    toolName: "code_search",
    isError: false,
    content: [{ type: "text", text: "X".repeat(40_000) }],
  });
  expect(offloadState.offloadToFile).toHaveBeenCalledWith("X".repeat(40_000));
  expect(largeIntercept).toEqual({
    content: [{ type: "text", text: "preview + file path" }],
  });

  offloadState.shouldOffload.mockReturnValueOnce(false);
  const smallIntercept = await handler({
    toolName: "get_search_content",
    isError: false,
    content: [{ type: "text", text: "short" }],
  });
  expect(smallIntercept).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts -t "offloads large code_search/get_search_content results and leaves small ones unchanged"`

Expected: FAIL — `TypeError: offloadState.shouldOffload.mockReturnValueOnce is not a function` (existing mock shape only had `offloadToFile`).

**Step 3 — Minimal implementation (test mock shape only)**

In `index.test.ts`, update the **existing** top-level offload mock shape from:

```typescript
const offloadState = vi.hoisted(() => ({ offloadToFile: vi.fn() }));
```

to:

```typescript
const offloadState = vi.hoisted(() => ({
  shouldOffload: vi.fn(() => false),
  offloadToFile: vi.fn(),
  buildOffloadResult: vi.fn(),
  cleanupTempFiles: vi.fn(),
}));
```

And ensure there is a **single** `vi.mock("./offload.js", ...)` block wired to this object:

```typescript
vi.mock("./offload.js", () => ({
  shouldOffload: offloadState.shouldOffload,
  offloadToFile: offloadState.offloadToFile,
  buildOffloadResult: offloadState.buildOffloadResult,
  cleanupTempFiles: offloadState.cleanupTempFiles,
  FILE_FIRST_PREVIEW_SIZE: 500,
}));
```

**Step 4 — Re-run test, verify it passes**

Run: `npx vitest run index.test.ts -t "offloads large code_search/get_search_content results and leaves small ones unchanged"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.
