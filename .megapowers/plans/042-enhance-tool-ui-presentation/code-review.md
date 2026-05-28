# Code Review — 042-enhance-tool-ui-presentation

## Files Reviewed

- **`render-helpers.ts`** (new, 249 lines, untracked) — Shared render module: tone vocabulary, status-line builder, `WidthSafeLines` Component, four per-tool renderers, call-header builder, fallback preview, error/working views.
- **`render-helpers.test.ts`** (new, untracked) — 50 unit tests covering tone maps, statusLine, width-safety (ANSI + CJK), per-tool renderers (success/partial/error/isPartial/expanded).
- **`index.ts`** (-190 / +31 lines) — Replaced 4 tools' ad-hoc `renderCall`/`renderResult` bodies with delegators to the new helpers; dropped now-unused `Text` import; added 5 helper imports.
- **`index.test.ts`** (+28 lines) — Added `visibleWidth` import, stub `theme`, and 2 web_search delegation smoke tests.

## Codex Review Adopted / Rejected

- **Adopted — P1 (codex, index.ts:2):** New module `render-helpers.ts` and its test file are untracked. Build will fail in any clean checkout until they're added to git. Flagged below as **Important**.
- **Rejected — P3 (codex, .megapowers/state.json):** This is the megapowers workflow's own state file; tracking it is the project's existing convention (the file pre-exists in HEAD). Not a code-review concern for this issue.

## Strengths

- **Single source of truth for tone vocabulary.** `TONE_COLOR` and `TONE_MARKER` (render-helpers.ts:13-24) eliminate four copies of color/marker phrasing. The "no emoji" invariant is enforced by test (`statusLine > never emits model-facing emoji glyphs`).
- **Width-safety is structural, not ad-hoc.** `WidthSafeLines.render` (render-helpers.ts:56-59) is the single chokepoint that runs `truncateToWidth` on every emitted line, so per-renderer code never has to think about ANSI width. Test exercises ANSI-wrapped + CJK + multiple widths.
- **Defensive `details` reading.** Every renderer treats `details` as `any` with optional chaining and `?? 0`/`?? ""` defaults; `Array.isArray` guards on `ptcValue.queries`/`urls`/`sources`. No path can throw on a malformed detail shape.
- **Tone derivation is centralized.** `toneFromCounts` (render-helpers.ts:107-111) makes the success/partial/error rule one line, reused by web_search and fetch_content.
- **Pure functions, no I/O, no state.** Helpers take `(result, opts, theme)` and return a `Component`; trivially testable, no mocks. Delegation in `index.ts` is one line per method.
- **Bug fix is real and tested.** AC12 (`get_search_content` always-success) is genuinely fixed by `d.error` branching (render-helpers.ts:208-210) and pinned by `renderGetContentResult > error tone when details.error is present (the bug being fixed)`.
- **Tests assert structure, not layout.** The stub theme `fg: (c, t) => \`<${c}>${t}</${c}>\`` lets tests assert role usage without coupling to exact spacing/ordering — robust against refactors.

## Findings

### Critical

None.

### Important

1. **Untracked source files not in the commit set** — `render-helpers.ts:1`, `render-helpers.test.ts:1`.
   - *What:* `git status` shows both files as untracked; only `index.ts` and `index.test.ts` are modified. A clean checkout would fail at `index.ts:2`'s `import "./render-helpers.js"`.
   - *Why it matters:* Build/test break for anyone who pulls without these files.
   - *Fix:* `git add render-helpers.ts render-helpers.test.ts` before committing. (Not done inline — this is a VCS concern and the user controls commits; flagging for the merge step.)

### Minor

1. **`errorMessageFrom` is also used for non-error content preview** — `render-helpers.ts:101`, used at lines 137, 178, 231.
   - *What:* The function reads `content[0].text` and is named for the error case, but `renderWebSearchResult`/`renderFetchContentResult`/`renderGetContentResult` also call it to produce the **success-path** expanded fallback. The name lies in those contexts.
   - *Why it matters:* Reader hits `previewFallbackLines(theme, errorMessageFrom(result))` on a success path and momentarily mistakes it for an error branch.
   - *Fix (later):* Rename to `firstTextOf(result)` or `contentText(result)`; trivial. Not changing now to keep this review's diff at zero.

2. **`code_search` expanded view dropped the previous content preview** — `render-helpers.ts:199-201`.
   - *What:* The pre-change `code_search` `renderResult` appended a 500-char preview of `content[0].text` when `expanded`. New helper only emits `[truncated]` when `d.truncated`. AC11 only requires "query label, char count, and a truncation indicator", so this is spec-compliant — but it's a UX regression vs. prior behavior.
   - *Why it matters:* Users who relied on inline preview in expanded mode lose it.
   - *Fix (optional):* Add `lines.push(...previewFallbackLines(theme, errorMessageFrom(result)))` in the `if (opts.expanded)` block, matching `renderGetContentResult`. Defer unless the regression is reported.

3. **`fetch_content` single-URL `truncated` flag no longer surfaced** — old single-URL path appended `" [truncated]"` when `details.truncated` was true; new helper does not.
   - *Why it matters:* Minor info loss for single-URL truncated fetches.
   - *Fix (optional):* In expanded mode (or even collapsed), if `d.truncated` add a `[truncated]` warning row, analogous to code_search. Not spec-mandated.

4. **`as any` casts at all four delegation sites** — `index.ts:386, 743, 827, 1009`.
   - *What:* `renderResult(result, options, theme) { return renderXResult(result as any, options, theme as any); }`.
   - *Why it matters:* Loses type-checking at the boundary between extension API types and the helper's `ResultLike`/`ThemeLike`. Currently necessary because `ThemeLike` is a structural subset and `result.details` is `unknown` in the API type, but it's a smell.
   - *Fix (later):* Either widen `ResultLike` to match the API surface or import the real `ToolResult`/`Theme` types and constrain helpers to them. Out of scope for this issue.

5. **`renderWebSearchResult` similarUrl arg gets wrapped in quotes** — `index.ts:382-385`.
   - *What:* `renderCall` builds `arg = \`similar: ${url}\`` then passes `\`"${arg}"\``, producing header text `"similar: https://x"` with quotes around the prefix. Old code emitted `similar: <url>` without surrounding quotes.
   - *Why it matters:* Cosmetic shift only. Indistinguishable in normal terminals; flagged so reviewers know it's intentional, not a bug.
   - *Fix (optional):* Special-case `similarUrl` to skip the quote wrapping if exact visual parity matters.

## Recommendations

- **Trim `as any` once helpers stabilize.** Lift `ResultLike` to match the real `ToolResult` from `@earendil-works/pi-coding-agent` so delegation sites become pass-through. Roll into a follow-up cleanup PR.
- **Consider a single `previewLines` helper** to dedupe the `expanded`-block tails of `renderCodeSearchResult` / `renderGetContentResult`. Not pressing; helpers are small.
- **Document the tone vocabulary** in a short comment block at the top of `render-helpers.ts` so future tool renderers know to reuse `statusLine` + `WidthSafeLines` instead of growing fresh markers.

## Assessment

**ready**

All 19 acceptance criteria are met with evidence; no correctness, security, or data-loss risks. The one Important finding (untracked files not in the commit set) is a git/VCS step the user controls at merge time, not a code defect — the files exist on disk, are imported correctly, and pass type-check + tests in this working tree. Minor findings are non-blocking UX/naming notes appropriate for a follow-up. Full suite green (28 files / 407 tests), `npx tsc --noEmit` clean.
