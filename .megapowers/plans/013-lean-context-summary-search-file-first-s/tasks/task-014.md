---
id: 14
title: fetch_content with prompt and successful filter returns inline without
  writing file
status: approved
depends_on:
  - 11
no_test: true
files_to_modify:
  - index.test.ts
files_to_create: []
---

### Task 14: fetch_content with prompt and successful filter returns inline without writing file [no-test] [depends: 11]

**AC covered:** AC 13
**Why no test in this task:** This is a verification-only lock task. The executable test coverage already exists in `index.test.ts` (`"uses filterContent in prompt mode, remaps no-model warning, preserves model-error warning, and keeps no-prompt raw behavior"`) and this task verifies that behavior remains intact without adding a second overlapping test.

**Files:**
- Verify: `index.test.ts`

**Verification steps**

1) Verify the no-file-write assertion exists in the prompt-success test:

```bash
grep -n "expect(offloadState.offloadToFile).not.toHaveBeenCalled()" index.test.ts
```

Expected output includes the exact assertion line.

2) Verify the inline filtered response assertion exists:

```bash
grep -n "Source: https://example.com/docs\\n\\n100 requests/minute\." index.test.ts
```

Expected output includes the prompt-success inline response expectation.

3) Run the focused prompt wiring test:

```bash
npx vitest run index.test.ts -t "uses filterContent in prompt mode"
```

Expected: PASS.

4) Run full test suite:

```bash
npx vitest run
```

Expected: all tests passing.
