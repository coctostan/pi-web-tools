# Learnings — 014-network-resilience-retry-parallel-batch

- **Integration tests must use fake timers when testing retry logic.** Both `exa-search.test.ts` and `exa-context.test.ts` initially ran with real 1s backoff delays, adding ~5 seconds to the suite on every run. This was caught in code review and fixed. Rule of thumb: any integration test that exercises a retry path should use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`, exactly like the unit tests in `retry.test.ts`.

- **`{ once: true }` in `addEventListener` is not full cleanup.** When the `delay()` timeout fires normally, the abort listener stays attached to the signal until it fires (a no-op on a settled promise). Using `removeEventListener` in the timer callback would be cleaner. Not a functional bug, but worth addressing when next touching `retry.ts`.

- **`mockResolvedValueOnce` → `mockResolvedValue` is a red flag in test diffs.** The change to make the 429 mock persistent (all calls return 429) was needed after `retryFetch` was wired in, but it silently turned a 0ms test into a 3s test. A better pattern: when wiring retry into a function, simultaneously add fake timers to any test that mocks retryable status codes.

- **`pLimit` instance per `execute()` call is the right granularity.** Sharing a single `pLimit(3)` across concurrent tool invocations would cause cross-request interference. Creating a new limiter inside each `execute()` body is clean and correct.

- **`successfulQueries++` inside concurrent `limit()` callbacks is safe.** JavaScript's single-threaded event loop makes `++` atomic at the statement level — no mutex or atomic needed for simple counters in concurrent async callbacks.

- **Batch failure isolation via per-query `try/catch` returning an error record is idiomatic.** The previous sequential loop used the same catch pattern; the parallel version preserves it exactly. `Promise.all` on an array that never rejects (each element catches its own error) is the right primitive here.

- **`git diff HEAD` (not `main`) for uncommitted work.** This feature's changes were uncommitted when code review started; `git diff main...HEAD` only showed prior-issue commits. Always check `git status` first to understand which changes are staged vs. committed vs. untracked.
