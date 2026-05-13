---
id: 8
title: Smoke-test pi -e ./index.ts registers all four tools against refreshed snapshot
status: approved
depends_on:
  - 7
no_test: true
files_to_modify: []
files_to_create:
  - scripts/smoke-load-extension.mjs
---

**Justification:** Acceptance criterion in issue #030 specifies a manual `pi -e ./index.ts` smoke test. We codify it as a Node script that invokes the extension factory directly against the refreshed `.pi/npm/node_modules` snapshot and asserts the four tool names (`web_search`, `code_search`, `fetch_content`, `get_search_content`) are registered. No vitest entry needed because this is an integration smoke run, executed once per release.

**Files:**
- Create: `scripts/smoke-load-extension.mjs`

**Step 1 — Make the change**

Create `scripts/smoke-load-extension.mjs`:

```js
// Smoke-test: load index.ts against the vendored @earendil-works snapshot and
// assert it registers exactly the four tools we ship.
// Run: node --import tsx scripts/smoke-load-extension.mjs
// Or:  npx tsx scripts/smoke-load-extension.mjs

const EXPECTED_TOOLS = new Set(["web_search", "code_search", "fetch_content", "get_search_content"]);

const registeredTools = new Set();
const registeredEvents = new Set();

const fakePi = {
  on: (event /* string */, _handler) => {
    registeredEvents.add(event);
  },
  registerTool: (tool) => {
    if (tool && typeof tool === "object" && typeof tool.name === "string") {
      registeredTools.add(tool.name);
    }
  },
  appendEntry: () => {},
};

const mod = await import("../index.ts");
const factory = mod.default;
if (typeof factory !== "function") {
  console.error("FAIL: index.ts default export is not a function");
  process.exit(1);
}
factory(fakePi);

const missing = [...EXPECTED_TOOLS].filter((t) => !registeredTools.has(t));
const extras = [...registeredTools].filter((t) => !EXPECTED_TOOLS.has(t));

if (missing.length || extras.length) {
  console.error("FAIL: tool registration mismatch");
  console.error("  missing:", missing);
  console.error("  extras:", extras);
  process.exit(1);
}

if (!registeredEvents.has("session_start") || !registeredEvents.has("session_shutdown")) {
  console.error("FAIL: missing lifecycle hooks; got", [...registeredEvents]);
  process.exit(1);
}

if (registeredEvents.has("session_switch") || registeredEvents.has("session_fork") || registeredEvents.has("session_tree")) {
  console.error("FAIL: legacy lifecycle hooks still registered:", [...registeredEvents]);
  process.exit(1);
}

console.log("OK: extension registered", [...registeredTools].sort().join(", "));
console.log("OK: lifecycle hooks", [...registeredEvents].sort().join(", "));
```

**Step 2 — Verify**

Run from repo root:

```bash
npx tsx scripts/smoke-load-extension.mjs
```

Expected output (exit code 0):

```
OK: extension registered code_search, fetch_content, get_search_content, web_search
OK: lifecycle hooks session_shutdown, session_start, tool_result
```

(`tool_result` is the existing `pi.on("tool_result", …)` registration at index.ts:156 and is expected to appear too.)

If `tsx` is not in the local toolchain, install it with `npm install --no-save tsx` before running, or use `node --experimental-strip-types scripts/smoke-load-extension.mjs` on Node 22.6+.
