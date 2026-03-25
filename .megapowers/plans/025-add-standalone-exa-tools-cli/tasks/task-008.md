---
id: 8
title: Document standalone CLI installation and usage
status: approved
depends_on:
  - 7
no_test: true
files_to_modify:
  - README.md
files_to_create: []
---

### Task 8: Document standalone CLI installation and usage [no-test]

**Justification:** documentation-only change; the meaningful verification is that the required install and usage guidance is present and matches the implemented commands.

**Files:**
- Modify: `README.md`

**Step 1 — Make the change**
Add a standalone CLI section to `README.md` covering:
- what the `exa-tools` binary is for
- global installation with `npm install -g @coctostan/pi-exa-gh-web-tools`
- required `EXA_API_KEY` environment variable for `search` and `code`
- command examples for:
  - `exa-tools search "vitest mock fetch" --n 3`
  - `exa-tools code "vitest mock fetch" --tokens 800`
  - `exa-tools fetch "https://vitest.dev/guide/mocking.html"`
  - `exa-tools fetch "https://vitest.dev/guide/mocking.html" --prompt "How do I mock a function?"`
- stdout/stderr behavior at a high level:
  - successful output goes to stdout
  - errors go to stderr
  - prompted fetch falls back to raw markdown with a warning when filtering is unavailable

**Step 2 — Verify**
Run: `grep -n "npm install -g @coctostan/pi-exa-gh-web-tools\|exa-tools search\|exa-tools code\|exa-tools fetch" README.md`
Expected: matching lines show the standalone CLI install command and all documented CLI examples
