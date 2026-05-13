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
