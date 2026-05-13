---
id: 33
type: feature
status: done
created: 2026-05-13T15:50:54.039Z
priority: 2
---
# Use ctx.signal for cancellation propagation; remove manual pendingFetches plumbing
## Problem

All four tool executors (`web_search`, `fetch_content`, `code_search`, `get_search_content`) hand-roll cancellation:

```ts
const abortController = new AbortController();
const fetchId = generateId();
pendingFetches.set(fetchId, abortController);

const combinedSignal = signal
  ? AbortSignal.any([signal, abortController.signal])
  : abortController.signal;

try { ... } finally { pendingFetches.delete(fetchId); }
```

This pre-dates the v0.63.2 `ctx.signal` addition, which is automatically aborted by pi when the user presses Escape, when the session shuts down, or when the agent loop is interrupted. The current code does two things the new API now does for free:

1. Wires the user-level abort into network calls.
2. Cancels in-flight fetches on session change/shutdown via `abortAllPending()`.

The manual approach still works, but it duplicates pi's plumbing, adds ~30 lines per tool, and the `pendingFetches` map is itself a small leak surface if a `finally` ever fails.

## Acceptance criteria

- Each tool executor uses the `signal` argument provided by pi directly (or `AbortSignal.any([signal, ctx.signal])` if both are still distinct in current pi — verify).
- The `pendingFetches` Map and `abortAllPending()` helper are removed.
- `session_start`/`session_shutdown` handlers stop calling `abortAllPending` (no longer needed; ctx-bound abort fires automatically).
- Tests still exercise that an in-flight fetch can be aborted; update `index.test.ts` to drive cancellation via the new mechanism.
- No regression in the 258-test suite.

## Files likely touched

- `index.ts` (delete `pendingFetches`, `abortAllPending`; simplify each `async execute`)
- `index.test.ts` (cancellation tests)

## References

- Pi changelog v0.63.2 — `ctx.signal` forwarding
- `dist/core/extensions/types.d.ts` — `ExtensionContext.signal` (verify presence; may be on the tool execute signature directly)

## Dependencies

- Best to land after #026 (session event migration) so the cancellation flow is reasoned about against the modern lifecycle.

