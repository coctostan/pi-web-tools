## Task 5: Add prompted fetch filtered output path

Your last edit corrupted the task body structure. The current file is missing the `**Step 1 — Write the failing test**` and `**Step 3 — Write minimal implementation**` headers, and the code blocks are no longer copy-pasteable. For example, the current Step 1 block starts mid-function:

```ts
import { describe, expect, it, vi } from "vitest";
import { runCli, type CliDeps } from "./cli.js";
  const stdout: string[] = [];
  const stderr: string[] = [];
```

Restore the full runnable test with the helper function header:

```ts
import { describe, expect, it, vi } from "vitest";
import { runCli, type CliDeps } from "./cli.js";

function makeIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}
```

Do the same for Step 3: restore the full `cli.ts` snippet with all helper function declarations intact, and keep the real default adapter wiring:

```ts
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { complete } from "@mariozechner/pi-ai";
import { getConfig } from "./config.js";
import { filterContent } from "./filter.js";

async function runStandaloneFilter(content: string, prompt: string): Promise<FilterResultLike> {
  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);
  const { filterModel } = getConfig();
  return filterContent(content, prompt, modelRegistry, filterModel, complete);
}
```

Keep the task as one runnable test and one implementation, and restore the Step 4 / Step 5 headings explicitly.

## Task 6: Add prompted fetch warning fallback to raw markdown

This task still fails two review criteria.

### 1. The task body is corrupted
Like Task 5, the file is missing Step headers and parts of the code were shifted or truncated. Example:

```ts
import { runCli, type CliDeps } from "./cli.js";
  const stdout: string[] = [];
  const stderr: string[] = [];
```

and later:

```ts
import { complete } from "@mariozechner/pi-ai";
  import { searchExa, formatSearchResults } from "./exa-search.js";
```

Restore a clean markdown structure with all five steps and fully copy-pasteable code.

### 2. Granularity is now wrong
Step 1 currently contains **two tests** in one task:
- fallback when `filterContent` returns `{ filtered: null, reason }`
- fallback when no filter dependency is available

Per the review rules, each task must be one test + one implementation. Keep **one** executable test in Step 1. Use the test for the real fallback shape from `filter.ts`:

```ts
vi.mocked(deps.filterContent!).mockResolvedValue({
  filtered: null,
  reason: "No filter model available",
});
```

Then, immediately below the Step 1 code block, add a short note explaining that the Step 3 implementation must also preserve the no-dependency branch:

```md
This task tests the real `filter.ts` fallback shape (`{ filtered: null, reason }`).
Step 3 must also keep the `if (!deps.filterContent)` branch that warns and returns raw markdown so the standalone runtime still exits 0 when no usable filter dependency is available.
```

In Step 3, keep this exact fallback structure:

```ts
if (deps.filterContent) {
  const filtered = await deps.filterContent(result.content, prompt);
  if (filtered.filtered !== null) {
    io.stdout(`Source: ${result.url}\n\n${filtered.filtered}`);
    return 0;
  }

  io.stderr(`Warning: ${filtered.reason ?? "No filter model available"}`);
  io.stdout(formatFetchedMarkdown(result.title, result.content));
  return 0;
}

io.stderr("Warning: No filter model available");
io.stdout(formatFetchedMarkdown(result.title, result.content));
return 0;
```

## Task 7: Wire package metadata and build output for the standalone binary

This file was also damaged during revision. The Step 1 code block for `bin/exa-tools.ts` is incomplete. It currently omits the call to `runCli` and only shows:

```ts
#!/usr/bin/env node
import { runCli } from "../cli.js";
process.exitCode = exitCode;
```

Restore the full source entrypoint snippet:

```ts
#!/usr/bin/env node
import { runCli } from "../cli.js";

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
```

Also restore the missing `**Step 1 — Make the change**` heading so the task again has a valid no-test structure.

Keep the minimal `package.json` edits you already described, including:

```json
"files": [
  "*.ts",
  "!*.test.ts",
  "!vitest.config.ts",
  "bin/**/*",
  "dist/**/*.js",
  "dist/**/*.d.ts",
  "LICENSE",
  "README.md"
]
```

and keep the verification command exactly as written.

## plan.md

Your top-level `.megapowers/plans/025-add-standalone-exa-tools-cli/plan.md` task list was also corrupted. Task 6 lost its numbered heading; the current file jumps from Task 5 bullets straight into:

```md
- Create `cli.fetch.prompt.fallback.test.ts`
- When prompt filtering returns no result ...
```

Restore the Task 6 heading explicitly:

```md
6. **Add prompted fetch warning fallback to raw markdown**
   - Create `cli.fetch.prompt.fallback.test.ts`
   - When prompt filtering returns no result or no filter dependency/runtime is available, warn on stderr and print raw markdown to stdout with exit code 0
```

Do not change approved tasks. Only repair the malformed sections and the Task 6 granularity issue above.
