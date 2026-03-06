# Verification Report — Issue 020

## Test Suite Results

```
 Test Files  15 passed (15)
      Tests  206 passed (206)
   Start at  10:40:20
   Duration  838ms
```

All 206 tests pass across all 15 test files.

---

## Step 1b: Bug Reproduction Confirmation

**Bug #018:** `FRESHNESS_MAP` now reads `realtime: 1` (was `0`). `normalizeWebSearchInput({ freshness: "realtime" })` returns `{ maxAgeHours: 1 }`. Old symptom (stale results from unconstrained search) no longer possible via this mapping.

**Bug #019:** `findSimilarExa` in `exa-search.ts` now appends `includeDomains`/`excludeDomains` to its request body (lines 164–169). `index.ts` forwards both fields to `findSimilarExa` (lines 215–216) and emits a warning note when `freshness` or `category` are provided with `similarUrl` (lines 202–207).

---

## Per-Criterion Verification

### Bug #018

#### Criterion 1: `freshness: "realtime"` maps to a non-zero value
**Evidence:** `tool-params.ts` line 11: `{ realtime: 1, day: 24, week: 168, any: undefined }`. Test `normalizeWebSearchInput maps freshness 'realtime' to maxAgeHours 1 (last 1 hour)` passes.
**Verdict:** pass

#### Criterion 2: Old test asserting `realtime → 0` removed/updated
**Evidence:** `tool-params.test.ts` line 93–96 now asserts `expect(result.maxAgeHours).toBe(1)`. No test in the suite asserts `toBe(0)` for realtime.
**Verdict:** pass

#### Criterion 3: `BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0` test passes
**Evidence:** `✓ tool-params.test.ts > tool-params > BUG #018: freshness 'realtime' must NOT map to maxAgeHours 0 (Exa ignores 0 as no-filter)`
**Verdict:** pass

#### Criterion 4: README documents corrected behavior
**Evidence:** `README.md` line 90: `` `"realtime"` (last 1 hour), `"day"` (last 24h), `"week"` (last 168h), or `"any"` (default, no filter) ``
**Verdict:** pass

---

### Bug #019

#### Criterion 1: `findSimilarExa` includes `includeDomains`/`excludeDomains` in request body
**Evidence:** `exa-search.ts` lines 164–169 add domain fields when non-empty. Tests:
- `✓ BUG #019: sends includeDomains in request body when provided`
- `✓ BUG #019: sends excludeDomains in request body when provided`
**Verdict:** pass

#### Criterion 2: `findSimilarExa` emits user-visible note for unsupported filters (`freshness`/`category`)
**Evidence:** `index.ts` lines 202–207 build `warningNote` for unsupported filters; line 223 prepends it to `answer`. Tests:
- `✓ includes a warning note when freshness is used with similarUrl`
- `✓ includes a warning note when category is used with similarUrl`
**Verdict:** pass

#### Criterion 3: `index.ts` call site passes `includeDomains`/`excludeDomains` to `findSimilarExa`
**Evidence:** `index.ts` lines 215–216 include `includeDomains` and `excludeDomains` in the `findSimilarExa` options object. Test:
- `✓ passes includeDomains and excludeDomains to findSimilarExa when similarUrl is provided`
**Verdict:** pass

#### Criterion 4: All four BUG #019 tests pass (domain tests pass; maxAgeHours/category tests assert absence)
**Evidence:**
- `✓ findSimilarExa does NOT forward maxAgeHours to /findSimilar (endpoint does not support it)`
- `✓ BUG #019: sends includeDomains in request body when provided`
- `✓ BUG #019: sends excludeDomains in request body when provided`
- `✓ findSimilarExa does NOT forward category to /findSimilar (endpoint does not support it)`
**Verdict:** pass

#### Criterion 5: README documents supported/unsupported params for `similarUrl`
**Evidence:** `README.md` line 94: `Find pages similar to this URL (alternative to \`query\`). Supports \`includeDomains\` and \`excludeDomains\`. Note: \`freshness\` and \`category\` are not supported and will produce a warning.`
**Verdict:** pass

---

## Overall Verdict

**pass**

All 9 acceptance criteria satisfied. 206/206 tests green. Both bugs confirmed fixed via code inspection and dedicated regression tests.
