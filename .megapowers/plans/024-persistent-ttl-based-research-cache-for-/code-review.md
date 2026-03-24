# Code Review: Persistent TTL-based Research Cache

## Files Reviewed

| File | Changes |
|------|---------|
| `research-cache.ts` | **New** — cache module (getCacheKey, getCached, putCache) |
| `research-cache.test.ts` | **New** — 14 unit tests |
| `config.ts` | Added `cacheTTLMinutes` field + parsing |
| `config.test.ts` | 3 new tests for cacheTTLMinutes |
| `tool-params.ts` | Added `noCache` to normalizeFetchContentInput |
| `tool-params.test.ts` | 3 new tests for noCache |
| `index.ts` | Cache integration (early return, putCache, multi-URL cache, schema) |
| `index.test.ts` | 5 new integration tests + cache mock setup |
| `ptc-value.test.ts` | Added research-cache mock + cacheTTLMinutes to config |

## Strengths

- **Clean module boundary** (`research-cache.ts:1-86`): Self-contained with no imports from index.ts. Pure functions, easy to test and reason about.
- **Early return optimization** (`index.ts:481-500`): Single-URL cache hit skips fetch AND filter — true zero-cost on hit.
- **Consistent integration pattern**: Both single-URL (`index.ts:481-500, 538-540`) and multi-URL (`index.ts:671-691`) flows use identical cache check + store logic.
- **Graceful degradation** (`research-cache.ts:27-29, 36-38`): Both load and save have try/catch — corrupt files and disk errors never crash the extension.
- **Test quality**: Tests verify behavior, not implementation — e.g., "extractContent not called on cache hit" proves the optimization, not just "getCached was called".
- **Minimal footprint**: +43 lines in index.ts, separate 86-line module. No new dependencies.

## Findings

### Critical

None.

### Important

None.

### Minor

1. **`_ttlMinutes` unused param in getCached** (`research-cache.ts:45`): The param exists for API symmetry but is unused — expiry uses `entry.ttlMinutes`. This is correct behavior (respects TTL at write time), and the `_` prefix is the right convention. No action needed, just documenting the design choice.

2. **Cache key model mismatch in edge case** (`index.ts:484, 540`): Read path uses `config.filterModel ?? "anthropic/claude-haiku-4-5"` but write path uses `filterResult.model` (the actual model used). If haiku is unavailable and gpt-4o-mini is auto-detected, the write key differs from the read key → cache miss on every read. **Impact**: Only affects users without haiku AND without `config.filterModel` set — a narrow edge case. Worst outcome is a cache miss (never stale data). Acceptable for this slice; could be improved later by resolving the actual model before the cache check.

## Recommendations

- Consider extracting the `config.filterModel ?? "anthropic/claude-haiku-4-5"` fallback into a shared constant or helper if it appears in more places in the future (currently 2 occurrences in index.ts).

## Assessment

**ready** — Clean implementation, well-tested, no bugs. The minor cache-key mismatch edge case is a performance nit (cache miss, not incorrect behavior) in a rare configuration scenario.
