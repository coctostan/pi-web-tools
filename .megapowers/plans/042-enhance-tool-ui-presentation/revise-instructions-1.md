# Plan Revision Instructions (iteration 1)

Five tasks need changes. Two issues are blocking (Task 10 self-failing test; missing Task-6 dependency on Tasks 8/10/11). Two are minor accuracy fixes (Task 7, Task 13).

Root cause of the dependency issue: the shared symbols `ResultLike`, `RenderOpts`, `errorMessageFrom`, and `toneFromCounts` are **first defined in Task 6** (`renderWebSearchResult`). Tasks 8, 10, and 11 use all four of these symbols but do not depend on Task 6. A developer executing Task 8/10/11 after only their listed prerequisites would hit `ReferenceError`/TS "Cannot find name 'ResultLike'" because those symbols would not yet exist in `render-helpers.ts`.

---

## Task 8: Add renderFetchContentResult collapsed status line

**Blocking — missing dependency.** Step 3 uses `ResultLike`, `RenderOpts`, `errorMessageFrom`, and `toneFromCounts`, all defined in Task 6. Current `depends_on: [3, 4]`.

Fix: change `depends_on` to `[3, 4, 6]`.

No code changes needed — the implementation is correct once the dependency is declared.

---

## Task 10: Add renderCodeSearchResult collapsed and expanded view

**Blocking — two problems.**

### Problem 1: the test will not pass with the given implementation.
Step 1's error-case test builds:
```ts
const out = mk({ query: "x", error: "no key" }, {}, true);
expect(out).toContain("no key");
```
`mk` sets `content: [{ type: "text", text: "code body here" }]`, and puts the error string only in `details.error`. But Step 3's implementation routes errors through `errorView(theme, errorMessageFrom(result))`, and `errorMessageFrom` returns `content[0].text` → `"code body here"`. The output never contains `"no key"`, so the assertion fails even after implementation.

Fix: make the error path prefer `details.error`, mirroring the (correct) pattern already used in Task 11. Replace the opening of `renderCodeSearchResult` in Step 3 with:
```ts
export function renderCodeSearchResult(result: ResultLike, opts: RenderOpts, theme: ThemeLike): Component {
  const d = result.details ?? {};
  if (result.isError || d.error) {
    return errorView(theme, d.error ? String(d.error) : errorMessageFrom(result));
  }
  if (opts.isPartial) return workingView(theme, "Searching code\u2026");

  const query = d.query ?? "code_search";
  const chars = typeof d.charCount === "number" ? `${d.charCount} chars` : undefined;

  const lines: string[] = [
    statusLine(theme, { tone: "success", label: query, counts: chars }),
  ];

  if (opts.expanded) {
    if (d.truncated) lines.push(theme.fg("warning", "  [truncated]"));
  }

  return new WidthSafeLines([lines].flat());
}
```
(The `[lines].flat()` is cosmetic; `new WidthSafeLines(lines)` is equally fine. The substantive change is the `result.isError || d.error` guard using `d.error` for the message.)

### Problem 2: missing dependency.
Same as Task 8 — uses `ResultLike`, `RenderOpts`, `errorMessageFrom` from Task 6. Change `depends_on` from `[3, 4, 5]` to `[3, 4, 5, 6]`.

---

## Task 11: Add renderGetContentResult with error-aware tone

**Blocking — missing dependency.** Step 3 uses `ResultLike`, `RenderOpts`, `errorMessageFrom` (defined in Task 6). Current `depends_on: [3, 4, 5]`.

Fix: change `depends_on` to `[3, 4, 5, 6]`.

The implementation is correct (it already reads `d.error` for the message) — only the dependency annotation needs fixing.

---

## Task 7: Add web_search expanded per-query rows

**Minor — inaccurate Step 2 expected-failure text.** Step 2 says:
```
Expected: FAIL — `AssertionError: expected 'undefined' to contain 'react hooks'`
```
But `render(80).join("\n")` returns the collapsed status-line string (not `undefined`) before the expanded rows are implemented. The real runner message will be:
```
Expected: FAIL — AssertionError: expected '<success>✓ search 2/2 queries, 3 sources' to contain 'react hooks'
```
Fix: update Step 2's expected message to reflect that `out` is the collapsed status line string, not `undefined`.

---

## Task 13: Wire all four tools' renderCall/renderResult to shared helpers

**Minor — non-existent import.** Step 1 imports:
```ts
import { theme } from "@earendil-works/pi-coding-agent";
```
The package root exports the `Theme` class and `type ThemeColor`, but **not** a lowercase `theme` instance (verified in `dist/index.d.ts`). This import will fail to resolve.

Fix: make the local stub theme the primary instruction rather than a fallback note. Replace the import guidance with:
```ts
// Stub theme: returns text unchanged; markers/counts still appear so the
// assertions on "\u2713" / "2/2" and visibleWidth hold.
const theme = { fg: (_c: string, s: string) => s, bold: (s: string) => s } as any;
```
Keep the `import { visibleWidth } from "@earendil-works/pi-tui";` line — that export is real.

No changes needed to Step 3's `index.ts` wiring; it is correct.

---

## Summary of edits
- Task 7: fix Step 2 expected-failure message text.
- Task 8: `depends_on` → `[3, 4, 6]`.
- Task 10: fix error path to use `d.error`; `depends_on` → `[3, 4, 5, 6]`.
- Task 11: `depends_on` → `[3, 4, 5, 6]`.
- Task 13: replace the `{ theme }` import with the inline stub theme.
