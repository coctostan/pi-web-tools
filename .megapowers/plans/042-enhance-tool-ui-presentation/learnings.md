# Learnings — 042-enhance-tool-ui-presentation

- **One width chokepoint beats N defensive `.slice()` calls.** Threading
  every line through `WidthSafeLines.render` → `truncateToWidth` once
  removed all per-renderer ANSI/CJK arithmetic. Future renderers only need
  to build themed strings; they cannot accidentally produce overflow.
- **Tone vocabulary as data, not strings, prevents drift.** `TONE_COLOR` and
  `TONE_MARKER` records made the "no model-facing emoji" invariant a
  one-line test (`expect(s).not.toContain("\u2705")`) instead of a code
  review checklist. Worth replicating for any other dimension that should
  be vocabulary-bounded.
- **TDD on pure renderers paid off disproportionately.** The renderers are
  `(result, opts, theme) => Component` with no I/O — every test ran in
  ~10 ms and was a single `render(width).join("\n")` assertion. 50 tests
  built up in 12 small Red-Green cycles with zero mock plumbing.
- **A stub theme of the shape `fg: (c, t) => \`<${c}>${t}</${c}>\`` is
  cheap and powerful.** Tests assert on role usage (`<warning>` /
  `<success>`) without coupling to spacing, ordering, or actual ANSI. Refactor-
  friendly. Reuse this pattern anywhere a `Theme` is on the boundary.
- **Spec scoping caught a real latent bug, not just style.** AC12
  (`get_search_content` always-success) wasn't visible from the brainstorm
  — it emerged when writing the unified error path. Spending plan-phase
  effort on `details` shape variants surfaced it explicitly with a
  failing→passing test ("the bug being fixed").
- **`as any` at delegation boundaries is a smell to track, not block on.**
  The four delegators cast `result`/`theme` because `ResultLike`/`ThemeLike`
  are structural subsets of the real pi-coding-agent types. The right fix
  is widening the helper types to match the API surface — but doing that
  inside this issue would have ballooned the diff. Tracked as a follow-up
  instead.
- **Plan tasks of ≤10 minutes each kept momentum.** 13 micro-tasks (each
  one symbol + one test) was easier than a few large ones, especially under
  the TDD guard which required real red-green cycles. The plan's "Step 2 —
  Expected: FAIL — `<exact error>`" lines proved invaluable: they detected
  one case where the test would have falsely passed without the failure
  message check.
