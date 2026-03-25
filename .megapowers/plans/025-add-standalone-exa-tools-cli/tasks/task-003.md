---
id: 3
title: Add code subcommand with EXA_API_KEY and --tokens
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - cli.ts
files_to_create:
  - cli.code.test.ts
---

### Task 3: Add code subcommand with EXA_API_KEY and --tokens [depends: 1]

**Files:**
- Modify: `cli.ts`
- Test: `cli.code.test.ts`

**Step 1 — Write the failing test**
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
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

function makeDeps(): CliDeps {
  return {
    searchExa: vi.fn(),
    formatSearchResults: vi.fn(),
    searchContext: vi.fn(),
    extractContent: vi.fn(),
  };
}

describe("runCli code command", () => {
  const originalEnv = process.env.EXA_API_KEY;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("dispatches code search to existing context logic and writes content to stdout", async () => {
    process.env.EXA_API_KEY = "exa-test-key";
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.searchContext).mockResolvedValue({
      query: "vitest mock fetch",
      content: "```ts\nvi.fn()\n```",
    });

    const exitCode = await runCli(["code", "vitest mock fetch", "--tokens", "800"], io, deps);

    expect(exitCode).toBe(0);
    expect(deps.searchContext).toHaveBeenCalledWith("vitest mock fetch", {
      apiKey: "exa-test-key",
      tokensNum: 800,
    });
    expect(stdout.join("\n")).toContain("vi.fn()");
    expect(stderr).toEqual([]);
  });

  it("fails with a clear stderr error when EXA_API_KEY is missing", async () => {
    delete process.env.EXA_API_KEY;
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli(["code", "vitest mock fetch"], io, deps);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("EXA_API_KEY");
    expect(deps.searchContext).not.toHaveBeenCalled();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run cli.code.test.ts`
Expected: FAIL — `AssertionError: expected 1 to be 0`

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

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parseSearchArgs(args: string[]): { query: string; numResults?: number } {
  const [query, ...rest] = args;
  if (!query) throw new Error('search requires a query: exa-tools search "<query>" [--n <count>]');

  let numResults: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--n") {
      const raw = requireValue(rest, i + 1, "--n");
      numResults = Number.parseInt(raw, 10);
      i++;
      continue;
    }
    throw new Error(`Unknown option for search: ${token}`);
  }

  return { query, numResults };
}

function parseCodeArgs(args: string[]): { query: string; tokensNum?: number } {
  const [query, ...rest] = args;
  if (!query) throw new Error('code requires a query: exa-tools code "<query>" [--tokens <count>]');

  let tokensNum: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--tokens") {
      const raw = requireValue(rest, i + 1, "--tokens");
      tokensNum = Number.parseInt(raw, 10);
      i++;
      continue;
    }
    throw new Error(`Unknown option for code: ${token}`);
  }

  return { query, tokensNum };
}

function isKnownCommand(command: string): boolean {
  return command === "search" || command === "code" || command === "fetch";
}

function requireExaApiKey(): string {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error("EXA_API_KEY is required for search and code commands.");
  }
  return apiKey;
}

export async function runCli(
  argv: string[],
  io: CliIO = defaultIo,
  deps: CliDeps = defaultDeps,
): Promise<number> {
  const [command, ...rest] = argv;

  if (!command) {
    io.stderr(USAGE);
    return 1;
  }

  if (!isKnownCommand(command)) {
    io.stderr(`Unknown command: ${command}\n\n${USAGE}`);
    return 1;
  }

  try {
    if (command === "search") {
      const { query, numResults } = parseSearchArgs(rest);
      const results = await deps.searchExa(query, {
        apiKey: requireExaApiKey(),
        numResults,
      });
      io.stdout(deps.formatSearchResults(results));
      return 0;
    }

    if (command === "code") {
      const { query, tokensNum } = parseCodeArgs(rest);
      const result = await deps.searchContext(query, {
        apiKey: requireExaApiKey(),
        tokensNum,
      });
      io.stdout(result.content);
      return 0;
    }

    io.stderr(`${command} is not implemented yet.`);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(message);
    return 1;
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run cli.code.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
