---
type: plan-review
iteration: 1
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
- Step 3 invents a new CLI-only `filterContent?: (content, prompt) => ...` dependency shape that does not match the real lower-level API in `filter.ts`, which is `filterContent(content, prompt, registry, configuredModel, completeFn)`.
- `defaultDeps` still omits `filterContent`, so the real standalone binary would always fall back to raw markdown and would never satisfy AC10 when a filter model is available.
- Because the task only proves an injected stub path, AC10/AC15 are not executable in the real codebase from this task alone.

### Task 6: Add prompted fetch warning fallback to raw markdown — ❌ REVISE
- This task inherits Task 5's missing real runtime wiring. The fallback branch only makes sense after Task 5 installs a real default filter path.
- Step 1 only exercises a mocked `{ filtered: null, reason }` branch; it does not make the real no-model/no-key runtime behavior executable.
- Step 3 should preserve the actual `reason` from `filter.ts` and still print raw markdown to stdout with exit `0`, but currently the overall plan would make prompted fetch fall back unconditionally because `defaultDeps.filterContent` is never wired.

### Task 7: Wire package metadata and build output for the standalone binary — ❌ REVISE
- The proposed `package.json` rewrite drops the existing `!vitest.config.ts` exclusion from the current `files` array, which is a packaging regression.
- AC2 is not explicit enough in the task body: the task should clearly state that the `bin/` source entrypoint is what compiles to `dist/bin/exa-tools.js`, instead of leaving the source path/output relationship ambiguous.
- Step 1 rewrites the full `package.json`; for this repo, the task should describe a minimal edit anchored to the current file to avoid accidentally removing unrelated fields/exclusions.

### Task 8: Document standalone CLI installation and usage — ✅ PASS
No issues.

### Missing Coverage
None by task mapping, but AC10 and AC11 are not fully executable with the current task details because Tasks 5 and 6 only cover mocked prompt-filter branches and never wire the real standalone filter runtime.

### Verdict
- **revise** — Tasks 5, 6, and 7 need adjustment before the plan is ready for implementation.

Reviser handoff saved to `.megapowers/plans/025-add-standalone-exa-tools-cli/revise-instructions-1.md`.
