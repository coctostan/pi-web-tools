# Learnings — Issue #024: Persistent TTL-based Research Cache

- **Cache check must happen BEFORE the fetch call, not just before filter.** The initial plan placed the cache check after `fetchOne()` (inside the `if (prompt)` block). This saved the model call but still made the network request. Moving it to an early-return before `fetchOne()` was necessary to achieve true zero-cost cache hits (AC 1).

- **`vi.clearAllMocks()` does NOT clear queued `mockReturnValueOnce` values.** This caused a subtle test interference: a `mockReturnValueOnce("...")` from one test leaked into the next when the mock wasn't called. Fix: use `mockReset()` in `beforeEach` for mocks where tests set `mockReturnValueOnce` or `mockImplementation`.

- **Test files that import index.ts need to mock ALL modules it imports.** When `research-cache.ts` was added as a new import to `index.ts`, the `ptc-value.test.ts` file (which also imports index.ts) broke because it didn't mock the new module. Every test file that does `await import("./index.js")` must have a corresponding `vi.mock()` for every module index.ts imports.

- **The `_ttlMinutes` unused parameter pattern is a valid design choice.** `getCached` accepts `ttlMinutes` for API symmetry with `putCache` but uses `entry.ttlMinutes` (the TTL stored at write time). This is correct — it means changing the config TTL doesn't retroactively invalidate existing entries. The `_` prefix convention documents this.

- **Separating the cache module from index.ts paid off immediately.** `research-cache.ts` has 14 unit tests that run in <10ms with no mocks beyond the filesystem. The integration tests in `index.test.ts` mock the cache module, keeping them focused on wiring rather than cache logic.

- **Coverage-only tasks (3, 4, 9, 11, 12) are fast but still need TDD ceremony.** Tasks where the test passes immediately still require going through the RED-GREEN cycle for the guard. This is friction but ensures every AC has explicit test coverage.
