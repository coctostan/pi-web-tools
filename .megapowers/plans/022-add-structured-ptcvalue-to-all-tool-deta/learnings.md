# Learnings — Issue #022

- **Pi's `ToolDefinition` type doesn't support `ptc` metadata yet.** The spec assumed it did based on PTC's `PtcToolOptions` interface, but the extension API hasn't exposed that field. Always verify the consumer type before planning a field addition. The `ptcValue` in `details` works fine without tool-level metadata.

- **Batch TDD across multiple tasks is awkward with per-task RED gates.** When all tasks share one test file and one implementation pass (15 tests RED → GREEN together), the per-task TDD cycle becomes ceremonial. Future plans should group related changes into fewer, larger tasks rather than splitting by tool when the implementation is uniform.

- **`fetch_content` has 9 distinct return paths.** This is the most complex tool by far. Each path (error, filtered, raw offloaded, GitHub clone, inline fallback, multi-URL with/without prompt) needed its own `ptcValue` construction. A helper function was planned but inline construction proved clearer given the slight per-path differences.

- **The diff was small (45 lines) but touched many locations.** Additive changes to existing return objects are low-risk but require careful enumeration of all return paths. The `git diff` verified no existing fields were disturbed.

- **Multi-URL paths needed structural changes** (accumulating a `ptcUrls` array alongside the text blocks) while single-URL paths were simple inline additions. This asymmetry was the main implementation complexity.
