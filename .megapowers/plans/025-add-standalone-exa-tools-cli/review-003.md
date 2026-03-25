---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 8
  - 4
  - 5
  - 6
  - 7
approved_tasks:
  - 1
  - 2
  - 3
  - 8
needs_revision_tasks:
  - 4
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

### Task 4: Add fetch subcommand raw markdown output — ❌ REVISE
- Step 1 is not strong enough for AC9. It only checks that stdout contains the title/body, so it would still pass if the CLI reused the extension's file-first preview/temp-file format for short content.
- Tighten the success assertion to prove the CLI writes raw markdown directly to stdout and does not emit `Full content saved to ...` or similar preview text.

### Task 5: Add prompted fetch filtered output path — ❌ REVISE
- Step 1 proves `filterContent` is called, but it does not prove the success path stays focused. As written, the test would still pass if `runCli()` printed the focused answer and the full extracted markdown.
- Strengthen the assertions so the success path explicitly does **not** leak the raw extracted body or heading.

### Task 6: Add prompted fetch warning fallback to raw markdown — ❌ REVISE
- Step 1 is also too loose for AC11. It only checks that stdout/stderr contain expected substrings, so it would still pass if the implementation mixed fallback output with extra wrapper text or focused output.
- Make the fallback contract exact: warning text on stderr, raw markdown on stdout, exit code `0`.

### Task 7: Wire package metadata and build output for the standalone binary — ❌ REVISE
- This task does not cover AC2 correctly. The acceptance criteria require the source entrypoint path to be `bin/exa-tools`, but the task still creates `bin/exa-tools.ts`.
- The proposed `tsconfig.json` change is not a realistic way to satisfy AC2: `tsc` will not compile an extensionless `bin/exa-tools` source file. The task needs to switch to an extensionless source file plus a build copy step that produces `dist/bin/exa-tools.js`.
- Update the task frontmatter, Step 1 snippet, and Step 2 verification to check both `bin/exa-tools` and `dist/bin/exa-tools.js`.

### Task 8: Document standalone CLI installation and usage — ✅ PASS
No issues.

### Missing Coverage
- **AC2** is not fully covered by the current task set because Task 7 still targets `bin/exa-tools.ts` instead of the required `bin/exa-tools` source path.

### Verdict
- **revise** — Tasks 4, 5, 6, and 7 need adjustment before the plan is ready for implementation.
