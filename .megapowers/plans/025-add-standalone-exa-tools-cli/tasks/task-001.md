---
id: 1
title: Add CLI usage runner and invalid-command handling
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - cli.ts
  - cli.usage.test.ts
---

### Task 1: Add CLI usage runner and invalid-command handling

**Files:**
- Create: `cli.ts`
- Test: `cli.usage.test.ts`

**Step 1 — Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";

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

describe("runCli usage handling", () => {
  it("prints usage and exits 1 when no subcommand is provided", async () => {
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli([], io);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Usage: exa-tools <command>");
    expect(stderr.join("\n")).toContain("search");
    expect(stderr.join("\n")).toContain("code");
    expect(stderr.join("\n")).toContain("fetch");
  });

  it("prints an unknown-command error and exits 1", async () => {
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli(["wat"], io);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("Unknown command: wat");
    expect(stderr.join("\n")).toContain("Usage: exa-tools <command>");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run cli.usage.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./cli.js" from "cli.usage.test.ts". Does the file exist?`

**Step 3 — Write minimal implementation**
```ts
import { searchExa, formatSearchResults } from "./exa-search.js";
import { searchContext } from "./exa-context.js";
import { extractContent } from "./extract.js";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface FilterResultLike {
  filtered: string | null;
  reason?: string;
  model?: string;
}

export interface CliDeps {
  searchExa: typeof searchExa;
  formatSearchResults: typeof formatSearchResults;
  searchContext: typeof searchContext;
  extractContent: typeof extractContent;
  filterContent?: (content: string, prompt: string) => Promise<FilterResultLike>;
}

const defaultIo: CliIO = {
  stdout: (text: string) => process.stdout.write(text.endsWith("\n") ? text : `${text}\n`),
  stderr: (text: string) => process.stderr.write(text.endsWith("\n") ? text : `${text}\n`),
};

const defaultDeps: CliDeps = {
  searchExa,
  formatSearchResults,
  searchContext,
  extractContent,
};

const USAGE = [
  "Usage: exa-tools <command> [options]",
  "",
  "Commands:",
  '  search "<query>" [--n <count>]',
  '  code "<query>" [--tokens <count>]',
  '  fetch "<url>" [--prompt "<question>"]',
].join("\n");

function isKnownCommand(command: string): boolean {
  return command === "search" || command === "code" || command === "fetch";
}

export async function runCli(
  argv: string[],
  io: CliIO = defaultIo,
  _deps: CliDeps = defaultDeps,
): Promise<number> {
  const [command] = argv;

  if (!command) {
    io.stderr(USAGE);
    return 1;
  }

  if (!isKnownCommand(command)) {
    io.stderr(`Unknown command: ${command}\n\n${USAGE}`);
    return 1;
  }

  io.stderr(`${command} is not implemented yet.`);
  return 1;
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run cli.usage.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
