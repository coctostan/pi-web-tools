# Code Review — 014-network-resilience-retry-parallel-batch

## Files Reviewed

| File | Change |
|------|--------|
| `retry.ts` | New — `retryFetch()` utility with exponential backoff and abort-signal support |
| `retry.test.ts` | New — 14 unit tests covering all retry branches with fake timers |
| `exa-context.ts` | `fetch` → `retryFetch` swap |
| `exa-context.test.ts` | New retry integration tests |
| `exa-search.ts` | `fetch` → `retryFetch` swap; summary/detail field changes (from #013) |
| `exa-search.test.ts` | New retry integration tests; existing "handles API errors" test adapted |
| `index.ts` | Sequential `for` loop → `pLimit(3)` + `Promise.all`; unbounded `Promise.all` → `pLimit(3)` |
| `index.test.ts` | New helpers and tests for parallel batch, detail passthrough, file-first |

---

## Strengths

- **`retry.ts` design** (`retry.ts:30–85`): Clean, single-responsibility module. The `delay()` helper is correctly extracted, handles abort via `{ once: true }` listener, and the pre-abort guard at line 39 prevents even a first fetch attempt when the signal is already aborted. Readable control flow.

- **Status code routing** (`retry.ts:6–7`): Two `Set` constants make it instantly clear which codes are retried and which return immediately. The fall-through for unknown codes (returns the response) is safe — callers check `response.ok`.

- **Backoff formula** (`retry.ts:48`): `initialDelayMs * Math.pow(2, attempt - 1)` — clean, correct exponential backoff. `attempt` starts at 1 on first retry, so attempt-1=0 gives 1× on first retry and 2× on second.

- **`retry.test.ts` test quality**: Uses fake timers throughout (`vi.useFakeTimers()`), validates exact timing via `advanceTimersByTimeAsync`, covers all seven spec scenarios with individual tests. No over-mocking — tests actual retry logic.

- **Parallel implementation** (`index.ts:195–233`): Idiomatic `pLimit(3)` + `queryList.map(q => limit(async () => {...}))` + `Promise.all`. Per-query `try/catch` ensures failure isolation. `pLimit` is instantiated per `execute()` call — no shared state across concurrent tool invocations.

- **Counter safety** (`index.ts:210-211`): `successfulQueries++` and `totalResults +=` inside `limit(async () => {...})` are safe from race conditions — JavaScript's event loop guarantees statement-level atomicity even in concurrent async callbacks.

- **`Promise.all` ordering preserved**: Batch results maintain query order regardless of which fetches complete first. Correct.

- **Single-URL bypass** (`index.ts:365–366`): Single-URL `fetch_content` skips `pLimit` overhead — appropriate micro-optimization.

---

## Findings

### Critical

None.

### Important — Fixed in this session

**Slow integration tests adding ~5s to test suite on every run**

- `exa-search.test.ts:118–128` ("handles API errors with status code in message"): changed from `mockResolvedValueOnce` to `mockResolvedValue` to handle retries, but ran with real backoff delays — **3003ms** (1s + 2s for 2 retries).
- `exa-search.test.ts:397–428` `describe("retry integration")`: two tests each waiting **~1002ms** real time.
- `exa-context.test.ts:75–99`: two retry tests each waiting **~1002ms** real time.

Total impact: ~5 seconds added to a suite that previously ran in ~2.7s.

**Root cause**: The integration tests awaited `searchExa`/`searchContext` directly without advancing fake timers, so real `setTimeout` delays executed.

**Fix applied**: Added `vi.useFakeTimers()`/`vi.useRealTimers()` wrappers with `vi.advanceTimersByTimeAsync()` to all four affected tests. `retry.test.ts` already used this pattern correctly — the integration tests now follow suit.

**Result after fix**: 163 tests pass, duration **789ms** (down from 7.7s — 90% faster).

### Minor

**1. `delay()` abort listener not cleaned up on normal resolution** — `retry.ts:18–26`

When `setTimeout` fires before the signal aborts, the `{ once: true }` listener remains attached to the signal. If the signal later aborts (e.g., during the subsequent `fetch()` call), the listener fires and calls `reject()` on the already-settled promise — a no-op per the Promises spec. No functional bug, but it's unclean. Fix:

```ts
const timer = setTimeout(() => {
  signal.removeEventListener("abort", onAbort);
  resolve();
}, ms);
const onAbort = () => {
  clearTimeout(timer);
  reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
};
signal.addEventListener("abort", onAbort, { once: true });
```

**2. `retryFetch()` ignores abort signal in `Request` objects** — `retry.ts:37`

Only `init?.signal` is read for the pre-abort check. If callers ever pass a `Request` object as `input` with its own signal, it won't be pre-checked. Not an issue for current callers (`exa-search.ts`, `exa-context.ts` always pass signal in `init`), but a gotcha for future use of this utility.

**3. `lastResponse!` non-null assertion lacks an explanatory comment** — `retry.ts:84`

The assertion is correct (the loop invariant guarantees `lastResponse` is set when this line is reached — only retryable status codes `continue` through the loop). A brief comment would aid future readers.

---

## Recommendations

- The minor `delay()` cleanup issue (finding #1) is low-risk but worth a follow-up PR when touching `retry.ts` again — it's a common pattern (e.g., Node.js `timers/promises` uses the same cleanup approach).
- If retry configuration ever becomes user-facing (via `web-tools.json`), the `RetryConfig` interface is already in the right shape to accept config values directly.

---

## Test Suite Results (after fixes)

```
 Test Files  13 passed (13)
      Tests  163 passed (163)
   Duration  789ms (down from 7.7s before fixes)
```

---

## Assessment

**ready**

The implementation is correct, well-structured, and consistent with codebase conventions. The one Important finding (slow integration tests) was fixed in this session: all 163 tests pass in 789ms. Three minor style/robustness notes are logged for future reference but do not block merge.
