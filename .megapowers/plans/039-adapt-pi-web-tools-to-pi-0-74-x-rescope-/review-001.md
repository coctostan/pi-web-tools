---
type: plan-review
iteration: 1
verdict: approve
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
approved_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
needs_revision_tasks: []
---

All 10 tasks pass review.

**Coverage:** Every "Fixed When" criterion (#1–#6) is addressed:
- #1 events → Tasks 3 (remove dead registrations) + 4 (reason inspection)
- #2 model auth → Task 2 (getApiKeyAndHeaders + headers thread-through, 10 tests)
- #3 scope → Tasks 5 (source imports) + 6 (manifest + typebox flip + 4.0.0 bump)
- #4 README → Task 9
- #5 vendored snapshot → Tasks 7 (regen) + 8 (smoke script)
- #6 end-to-end → Task 10

**Sequencing:** Correct — install peers first (1), behavior migrations on legacy scope while types still resolve via vitest type-erasure (2,3,4), then scope flip (5) which unblocks `npm run build` against the new types, then manifest (6), vendored snapshot (7), smoke (8), docs (9), final verify (10).

**API realism (verified against real packages):**
- `@earendil-works/pi-coding-agent@0.74.0` exposes `getApiKeyAndHeaders(model): Promise<ResolvedRequestAuth>` — Task 2 impl matches.
- `session_start{reason: "startup"|"reload"|"new"|"resume"|"fork"}` exists; `session_switch`/`session_fork` overloads gone (replaced by `session_before_*`). `session_tree` still typed but spec correctly notes it's not fired for the user flows of interest.
- `typebox@1.1.38` exports `Type` namespace via `export * as Type from './typebox.mjs'` — Task 6's `import { Type } from "typebox"` resolves and the schema builders (`Object`, `String`, `Optional`, `Array`, `Union`, `Literal`, `Number`, `Boolean`) are all present.

**TDD:** Tasks 2–6 follow full 5-step TDD with realistic expected failure messages. Tasks 1, 7, 8, 9, 10 are correctly marked `no_test: true` with valid justifications (install/snapshot/docs/integration-smoke/verification).

**Granularity:** Each TDD task is one test file + one impl change.

**Minor non-blocking observations** (do not require revision):
- Task 4 reload test asserts negatives only; could also assert `restoreFromSession` is invoked. Acceptable since spec says "only restoreFromSession, if at all".
- Task 7 guidance is slightly ambiguous about whether legacy `.pi/npm/node_modules/@mariozechner/` must be absent vs. allowed-as-transitive; the implementer should follow the "document and leave" branch if it appears as a transitive.
- Task 8 smoke script imports from project `node_modules`, not `.pi/npm/node_modules`. This codifies the AC's manual test rather than fully exercising the vendored snapshot; matches the spec's scope.

Ready for implementation.
