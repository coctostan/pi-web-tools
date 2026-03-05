# Code Review — 012-haiku-filter-on-fetch-content

## Files Reviewed

| File | Change |
|------|--------|
| `filter.ts` | New module: `resolveFilterModel`, `filterContent`, types |
| `index.ts` | Added `prompt` param wiring, single/multi-URL filter paths |
| `config.ts` | Added `filterModel?: string` to `WebToolsConfig`, parse logic |
| `tool-params.ts` | Added `prompt` extraction to `normalizeFetchContentInput` |
| `filter.test.ts` | New test file: 9 tests for filter module |
| `index.test.ts` | Extended: 3 tests covering single-URL, multi-URL, no-prompt paths |
| `config.test.ts` | Extended: 2 tests for filterModel read/default |
| `tool-params.test.ts` | Extended: 2 tests for prompt extraction |

---

## Strengths

- **Clean separation of concerns** (`filter.ts:1-103`): Model resolution and content filtering are extracted into a dedicated module with clear, independently testable functions. `filterContent` accepts a `completeFn` injectable, making tests trivial without network mocks.

- **Robust discriminated union typing** (`filter.ts:17-19`): `FilterResult` as `{ filtered: string; model: string } | { filtered: null; reason: string }` is idiomatic TypeScript — no magic strings or boolean flags.

- **Layered fallback chain** (`filter.ts:36-61`): Configured model → Haiku → GPT-4o-mini → reason string. Clear priority, each step independently gated by `registry.find()` + `getApiKey()`. The design correctly treats a missing configured model as a hard fail (not a silent fallback) — if a user explicitly configures a model they want to know when it's unavailable.

- **Warning message normalization** (`index.ts:401-403`): The `No filter model available` prefix check cleanly produces the user-facing warning without leaking the full tried-list into the output. Good UX boundary.

- **Test coverage is meaningful** — `index.test.ts` tests the actual execute handler with a real mock of `filterContent`, covering all three single-URL cases (filtered success, no-model fallback, model-error fallback) and no-prompt regression in one test. The multi-URL test validates pLimit(3) call, filterContent call count, and the block format.

- **`p-limit` used correctly** (`index.ts:450`): called once per `execute` invocation, not at module level, so the concurrency window is scoped correctly.

---

## Findings

### Critical
None.

### Important

**`index.ts:474` (pre-fix) — Multi-URL prompt fallback returned raw content without truncation**

- **What was wrong:** The single-URL fallback path (lines 405-411) truncates at `MAX_INLINE_CONTENT` (30K chars) and adds a `get_search_content` hint. The multi-URL path simply returned `` `⚠ ${reason}\n\n# ${r.title}\n\n${r.content}` `` with no cap. With 5 URLs × 25K chars each = 125K chars — potentially overwhelming the main model's context.
- **Why it matters:** The entire point of this feature is context reduction. A fallback that silently injects 50-125K chars of raw content defeats that purpose.
- **Fix applied:** Added per-block truncation at `MAX_INLINE_CONTENT` with a `get_search_content` reference using the in-scope `responseId` and `r.url`. Tests still pass (123/123).

### Minor

**`filter.ts:93` (pre-fix) — `.join("\n")` inconsistent indentation**

- `.filter()` and `.map()` were at 6-space indent; `.join()` was at 4-space indent, breaking the chain alignment.
- **Fix applied:** aligned `.join("\n")` to 6-space indent. No behavior change.

**`index.ts:480` (pre-fix) — `return {` at 8-space indent inside 10-space `if (prompt)` block**

- `const successCount` (line 479) used 10 spaces; the immediately following `return {` used 8. Semantically correct but visually implied it was outside the `if` block.
- **Fix applied:** corrected to 10-space indent. No behavior change.

**`filter.ts:72` — redundant `!("apiKey" in resolved)` guard**

```ts
if (!resolved.model || !("apiKey" in resolved)) {
  return { filtered: null, reason: resolved.reason };
}
```
- `!resolved.model` alone is sufficient to discriminate the `FilterModelResult` union (null-model branch is the only one with `reason`). The `"apiKey" in` check is redundant. The cast on line 76 is still needed for `Model<Api>` widening regardless.
- **Not fixed:** harmless and the extra guard is arguably defensive. Left as a note.

**`index.ts:544-550` — `renderResult` details type omits `filtered`/`filterModel`**

```ts
const details = result.details as {
  title?: string; charCount?: number; truncated?: boolean;
  successCount?: number; totalCount?: number;
} | undefined;
```
- Filtered results include `filtered: true` and `filterModel: "anthropic/..."` in details (line 395-397), but these aren't surfaced in the TUI render. A `[filtered]` tag on the char count line would be a nice UX signal.
- **Not fixed:** out of scope for this issue; purely cosmetic.

---

## Recommendations

1. **Add a test for multi-URL fallback truncation** — the truncation fix in the multi-URL path isn't covered by the current `index.test.ts` (the test mocks `filterContent` to always succeed or use a pre-canned reason; raw content is short). Worth a unit test where `r.content` is longer than `MAX_INLINE_CONTENT` to lock in the truncation behavior.

2. **Consider surfacing filter model in TUI** — `renderResult` could show `(filtered via haiku)` or similar when `details.filtered === true`. Low priority but useful for observability.

3. **Configured model fallback behavior** — if `filterModel` is configured but the API key is missing (returns `"Configured filterModel ... not available"`), the tool warns and returns raw content. This is correct but the warning string doesn't match the "No filter model available" prefix, so it falls through the `startsWith` check and is shown verbatim as `⚠ Configured filterModel "anthropic/claude-haiku-4-5" not available (no model or API key)`. This is clear and correct — document it or add a test to pin the behavior.

---

## Post-Fix Test Results

```
 Test Files  12 passed (12)
      Tests  123 passed (123)
   Duration  758ms
```

All 123 tests pass after the three fixes.

---

## Assessment

**ready**

The implementation is correct, well-structured, and follows codebase conventions throughout. The Important finding (multi-URL fallback truncation) was fixed in-session. All three fixes were verified against the full test suite (123/123 pass). The remaining Minor findings are cosmetic only and don't affect correctness or safety.
