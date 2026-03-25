---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 8
  - 5
  - 6
  - 7
approved_tasks:
  - 1
  - 2
  - 3
  - 4
  - 8
needs_revision_tasks:
  - 5
  - 6
  - 7
---

### Per-Task Assessment

### Task 1: Add CLI usage runner and invalid-command handling — ✅ PASS
No issues.

### Task 2: Add search subcommand with EXA_API_KEY and --n — ✅ PASS
No issues.

### Task 3: Add code subcommand with EXA_API_KEY and --tokens — ✅ PASS
No issues.

### Task 4: Add fetch subcommand raw markdown output — ✅ PASS
No issues.

### Task 5: Add prompted fetch filtered output path — ❌ REVISE
- The last revision corrupted the task body. `Step 1` and `Step 3` headers are missing, and both code blocks are no longer copy-pasteable. The current test block starts mid-function (`const stdout: string[] = [];`) instead of with `function makeIo() { ... }`.
- Because the task no longer has a clean 5-step structure with runnable code, it fails TDD completeness and self-containment even though the intended API wiring is now correct.

### Task 6: Add prompted fetch warning fallback to raw markdown — ❌ REVISE
- The task body is also corrupted: step headers are missing and parts of the code block are malformed (for example `import { complete } from "@mariozechner/pi-ai";` is followed by an indented partial import line).
- Step 1 now contains two tests in one task. That violates the granularity rule of one test + one implementation per task.
- Keep one executable test for the real `filter.ts` fallback shape (`{ filtered: null, reason }`), and keep the no-dependency branch in Step 3 as documented implementation behavior.

### Task 7: Wire package metadata and build output for the standalone binary — ❌ REVISE
- The task body was damaged during revision. The `bin/exa-tools.ts` snippet is incomplete: it imports `runCli` and sets `process.exitCode = exitCode`, but omits `const exitCode = await runCli(process.argv.slice(2));`.
- The no-test task structure is incomplete because the `Step 1 — Make the change` heading is missing.
- The minimal-package-edit guidance is now correct, including preservation of `!vitest.config.ts`, but the task still fails self-containment until the code snippet and headings are restored.

### Task 8: Document standalone CLI installation and usage — ✅ PASS
No issues.

### Missing Coverage
No acceptance-criteria gaps.

### Verdict
- **revise** — Tasks 5, 6, and 7 still need cleanup before the plan is ready for implementation.

Additional note: the top-level plan artifact `.megapowers/plans/025-add-standalone-exa-tools-cli/plan.md` was also corrupted during revision. Task 6 lost its numbered heading in the task list and should be repaired along with the task files.
