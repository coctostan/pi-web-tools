---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 9
  - 12
  - 7
  - 8
  - 10
  - 11
  - 13
approved_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 9
  - 12
needs_revision_tasks:
  - 7
  - 8
  - 10
  - 11
  - 13
---

Coverage is complete (all 19 ACs mapped) and the shared-helper architecture is sound, including the key insight that width-safety must live in `Component.render(width)` since renderResult/renderCall receive no width. Verified against the codebase: Vitest + `npm test`, `.js` imports, `ThemeColor`/`Theme` exported from pi-coding-agent root, pi-tui exports (`truncateToWidth`/`visibleWidth`/`Component`), and all four tools' details/ptcValue shapes.

3 blocking + 2 minor issues require revision (see revise-instructions-1.md):

BLOCKING:
- Task 8: uses ResultLike/RenderOpts/errorMessageFrom/toneFromCounts (first defined in Task 6) but depends_on is [3,4] — missing Task 6. Change to [3,4,6].
- Task 10: (a) self-failing test — error-case asserts output contains "no key" (in details.error) but impl routes through errorMessageFrom → returns content[0].text ("code body here"); fix error path to prefer d.error like Task 11. (b) missing Task 6 dep → [3,4,5,6].
- Task 11: implementation correct but depends_on [3,4,5] omits Task 6 (uses its shared symbols) → [3,4,5,6].

MINOR:
- Task 7: Step 2 expected-failure text says "expected 'undefined'" but `out` is the collapsed status-line string; correct the runner message.
- Task 13: Step 1 imports `{ theme }` from pi-coding-agent root which doesn't export a lowercase theme instance; make the inline stub theme the primary instruction.

Tasks 1–6, 9, 12 pass all six criteria as written. index.ts wiring in Task 13 is correct; only its test-import needs fixing.
