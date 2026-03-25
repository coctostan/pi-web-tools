# Plan

### Task 1: Add CLI usage runner and invalid-command handling

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

### Task 2: Add search subcommand with EXA_API_KEY and --n [depends: 1]

### Task 2: Add search subcommand with EXA_API_KEY and --n [depends: 1]

**Files:**
- Modify: `cli.ts`
- Test: `cli.search.test.ts`

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

describe("runCli search command", () => {
  const originalEnv = process.env.EXA_API_KEY;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("dispatches search to existing Exa search logic and writes markdown to stdout", async () => {
    process.env.EXA_API_KEY = "exa-test-key";
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.searchExa).mockResolvedValue([
      { title: "Vitest docs", url: "https://vitest.dev", snippet: "Mocking guide" },
    ]);
    vi.mocked(deps.formatSearchResults).mockReturnValue(
      "1. **Vitest docs**\n   https://vitest.dev\n   Mocking guide",
    );

    const exitCode = await runCli(["search", "vitest mock fetch", "--n", "2"], io, deps);

    expect(exitCode).toBe(0);
    expect(deps.searchExa).toHaveBeenCalledWith("vitest mock fetch", {
      apiKey: "exa-test-key",
      numResults: 2,
    });
    expect(stdout.join("\n")).toContain("**Vitest docs**");
    expect(stderr).toEqual([]);
  });

  it("fails with a clear stderr error when EXA_API_KEY is missing", async () => {
    delete process.env.EXA_API_KEY;
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    const exitCode = await runCli(["search", "vitest mock fetch"], io, deps);

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("EXA_API_KEY");
    expect(deps.searchExa).not.toHaveBeenCalled();
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run cli.search.test.ts`
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
Run: `npx vitest run cli.search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 3: Add code subcommand with EXA_API_KEY and --tokens [depends: 1]

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

### Task 4: Add fetch subcommand raw markdown output [depends: 1]

### Task 4: Add fetch subcommand raw markdown output [depends: 1]
**Files:**
- Modify: `cli.ts`
- Test: `cli.fetch.raw.test.ts`
**Step 1 — Write the failing test**
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
function makeDeps(): CliDeps {
  return {
    searchExa: vi.fn(),
    formatSearchResults: vi.fn(),
    searchContext: vi.fn(),
    extractContent: vi.fn(),
  };
}
describe("runCli fetch command", () => {
  it("writes full extracted markdown to stdout when no prompt is provided", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "# Example Page\n\nThis is the extracted body.",
      error: null,
    });

    const exitCode = await runCli(["fetch", "https://example.com/page"], io, deps);
    expect(exitCode).toBe(0);
    expect(deps.extractContent).toHaveBeenCalledWith("https://example.com/page");
    expect(stdout.join("\n")).toBe("# Example Page\n\nThis is the extracted body.");
    expect(stdout.join("\n")).not.toContain("Full content saved to");
    expect(stderr).toEqual([]);
  });
  it("writes fetch errors to stderr and exits 1", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();

    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "",
      content: "",
      error: "HTTP 404 Not Found",
    });

    const exitCode = await runCli(["fetch", "https://example.com/page"], io, deps);
    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("\n")).toContain("HTTP 404 Not Found");
  });
});
```
**Step 2 — Run test, verify it fails**
Run: `npx vitest run cli.fetch.raw.test.ts`
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
function parseFetchArgs(args: string[]): { url: string; prompt?: string } {
  const [url, ...rest] = args;
  if (!url) throw new Error('fetch requires a URL: exa-tools fetch "<url>" [--prompt "<question>"]');
  let prompt: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--prompt") {
      prompt = requireValue(rest, i + 1, "--prompt");
      i++;
      continue;
    }
    throw new Error(`Unknown option for fetch: ${token}`);
  }
  return { url, prompt };
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
function formatFetchedMarkdown(title: string, content: string): string {
  if (content.startsWith(`# ${title}`)) return content;
  return `# ${title}\n\n${content}`;
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
    if (command === "fetch") {
      const { url, prompt } = parseFetchArgs(rest);
      const result = await deps.extractContent(url);
      if (result.error) {
        io.stderr(result.error);
        return 1;
      }
      if (!prompt) {
        io.stdout(formatFetchedMarkdown(result.title, result.content));
        return 0;
      }
      io.stderr("prompted fetch is not implemented yet.");
      return 1;
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
Run: `npx vitest run cli.fetch.raw.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 5: Add prompted fetch filtered output path [depends: 4]

### Task 5: Add prompted fetch filtered output path [depends: 4]
**Files:**
- Modify: `cli.ts`
- Test: `cli.fetch.prompt.filtered.test.ts`
**Step 1 — Write the failing test**
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
function makeDeps(): CliDeps {
  return {
    searchExa: vi.fn(),
    formatSearchResults: vi.fn(),
    searchContext: vi.fn(),
    extractContent: vi.fn(),
    filterContent: vi.fn(),
  };
}
describe("runCli prompted fetch", () => {
  it("uses filterContent when available and writes focused output to stdout", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();
    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "# Example Page\n\nLong extracted body.",
      error: null,
    });
    vi.mocked(deps.filterContent!).mockResolvedValue({
      filtered: "Use `vi.fn()` to create a mock function.",
      model: "anthropic/claude-haiku-4-5",
    });
    const exitCode = await runCli(
      ["fetch", "https://example.com/page", "--prompt", "How do I mock a function?"],
      io,
      deps,
    );
    expect(exitCode).toBe(0);
    expect(deps.filterContent).toHaveBeenCalledWith(
      "# Example Page\n\nLong extracted body.",
      "How do I mock a function?",
    );
    expect(stdout.join("\n")).toContain("Use `vi.fn()` to create a mock function.");
    expect(stdout.join("\n")).not.toContain("Long extracted body.");
    expect(stdout.join("\n")).not.toContain("# Example Page");
    expect(stderr).toEqual([]);
  });
});
```

This test keeps the command behavior isolated, but the Step 3 implementation must also wire the real standalone default `filterContent` dependency so the actual `exa-tools fetch <url> --prompt ...` binary can use the existing filter pipeline without going through `index.ts`.
**Step 2 — Run test, verify it fails**
Run: `npx vitest run cli.fetch.prompt.filtered.test.ts`
Expected: FAIL — `AssertionError: expected 1 to be 0`
**Step 3 — Write minimal implementation**
```ts
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { complete } from "@mariozechner/pi-ai";
import { searchExa, formatSearchResults } from "./exa-search.js";
import { searchContext } from "./exa-context.js";
import { extractContent } from "./extract.js";
import { getConfig } from "./config.js";
import { filterContent } from "./filter.js";
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
async function runStandaloneFilter(content: string, prompt: string): Promise<FilterResultLike> {
  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);
  const { filterModel } = getConfig();
  return filterContent(content, prompt, modelRegistry, filterModel, complete);
}
const defaultDeps: CliDeps = {
  searchExa,
  formatSearchResults,
  searchContext,
  extractContent,
  filterContent: runStandaloneFilter,
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
function parseFetchArgs(args: string[]): { url: string; prompt?: string } {
  const [url, ...rest] = args;
  if (!url) throw new Error('fetch requires a URL: exa-tools fetch "<url>" [--prompt "<question>"]');
  let prompt: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--prompt") {
      prompt = requireValue(rest, i + 1, "--prompt");
      i++;
      continue;
    }
    throw new Error(`Unknown option for fetch: ${token}`);
  }
  return { url, prompt };
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
function formatFetchedMarkdown(title: string, content: string): string {
  if (content.startsWith(`# ${title}`)) return content;
  return `# ${title}\n\n${content}`;
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
    if (command === "fetch") {
      const { url, prompt } = parseFetchArgs(rest);
      const result = await deps.extractContent(url);
      if (result.error) {
        io.stderr(result.error);
        return 1;
      }
      if (!prompt) {
        io.stdout(formatFetchedMarkdown(result.title, result.content));
        return 0;
      }
      if (deps.filterContent) {
        const filtered = await deps.filterContent(result.content, prompt);
        if (filtered.filtered !== null) {
          io.stdout(`Source: ${result.url}\n\n${filtered.filtered}`);
          return 0;
        }
      }
      io.stderr("Warning: no filter model available; printing raw extracted markdown.");
      io.stdout(formatFetchedMarkdown(result.title, result.content));
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
Run: `npx vitest run cli.fetch.prompt.filtered.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 6: Add prompted fetch warning fallback to raw markdown [depends: 5]

### Task 6: Add prompted fetch warning fallback to raw markdown [depends: 5]
**Files:**
- Modify: `cli.ts`
- Test: `cli.fetch.prompt.fallback.test.ts`
**Step 1 — Write the failing test**
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
    function makeDeps(): CliDeps {
  return {
    searchExa: vi.fn(),
    formatSearchResults: vi.fn(),
    searchContext: vi.fn(),
    extractContent: vi.fn(),
    filterContent: vi.fn(),
  };
}
    describe("runCli prompted fetch fallback", () => {
  it("warns with the filter reason, prints raw markdown to stdout, and exits 0 when filter resolution returns no model", async () => {
    const deps = makeDeps();
    const { io, stdout, stderr } = makeIo();
    vi.mocked(deps.extractContent).mockResolvedValue({
      url: "https://example.com/page",
      title: "Example Page",
      content: "# Example Page\n\nLong extracted body.",
      error: null,
    });
    vi.mocked(deps.filterContent!).mockResolvedValue({
      filtered: null,
      reason: "No filter model available",
    });
    const exitCode = await runCli(
      ["fetch", "https://example.com/page", "--prompt", "How do I mock a function?"],
      io,
      deps,
    );
    expect(exitCode).toBe(0);
    expect(stderr.join("\n")).toBe("Warning: No filter model available");
    expect(stdout.join("\n")).toBe("# Example Page\n\nLong extracted body.");
  });
});
```
This task tests the real `filter.ts` fallback shape (`{ filtered: null, reason }`).
Step 3 must also keep the `if (!deps.filterContent)` branch that warns and returns raw markdown so the standalone runtime still exits 0 when no usable filter dependency is available.
**Step 2 — Run test, verify it fails**
Run: `npx vitest run cli.fetch.prompt.fallback.test.ts`
Expected: FAIL — `AssertionError: expected 'Warning: no filter model available; printing raw extracted markdown.' to be 'Warning: No filter model available'`
**Step 3 — Write minimal implementation**
```ts
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { complete } from "@mariozechner/pi-ai";
import { searchExa, formatSearchResults } from "./exa-search.js";
import { searchContext } from "./exa-context.js";
import { extractContent } from "./extract.js";
import { getConfig } from "./config.js";
import { filterContent } from "./filter.js";
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
async function runStandaloneFilter(content: string, prompt: string): Promise<FilterResultLike> {
  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);
  const { filterModel } = getConfig();
  return filterContent(content, prompt, modelRegistry, filterModel, complete);
}
    const defaultDeps: CliDeps = {
  searchExa,
  formatSearchResults,
  searchContext,
  extractContent,
  filterContent: runStandaloneFilter,
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
function parseFetchArgs(args: string[]): { url: string; prompt?: string } {
  const [url, ...rest] = args;
  if (!url) throw new Error('fetch requires a URL: exa-tools fetch "<url>" [--prompt "<question>"]');
  let prompt: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--prompt") {
      prompt = requireValue(rest, i + 1, "--prompt");
      i++;
      continue;
    }
    throw new Error(`Unknown option for fetch: ${token}`);
  }
  return { url, prompt };
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
function formatFetchedMarkdown(title: string, content: string): string {
  if (content.startsWith(`# ${title}`)) return content;
  return `# ${title}\n\n${content}`;
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
    if (command === "fetch") {
      const { url, prompt } = parseFetchArgs(rest);
      const result = await deps.extractContent(url);
      if (result.error) {
        io.stderr(result.error);
        return 1;
      }
      if (!prompt) {
        io.stdout(formatFetchedMarkdown(result.title, result.content));
        return 0;
      }
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
Run: `npx vitest run cli.fetch.prompt.fallback.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

### Task 7: Wire package metadata and build output for the standalone binary [no-test] [depends: 6]

### Task 7: Wire package metadata and build output for the standalone binary [no-test]

**Justification:** package metadata, build scripting, and binary entrypoint wiring only; the meaningful verification is that the source wrapper exists at the required path and the build emits the published binary at the required output path.

**Files:**
- Create: `bin/exa-tools`
- Modify: `package.json`

**Step 1 — Make the change**
Create the extensionless source entrypoint at `bin/exa-tools`:
```js
#!/usr/bin/env node
import { runCli } from "../cli.js";

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
```

Update `package.json` minimally from the current file:
- add a `bin` field:
```json
"bin": {
  "exa-tools": "dist/bin/exa-tools.js"
}
```
- add build hooks under `scripts` without removing the existing test scripts:
```json
"scripts": {
  "build": "tsc -p tsconfig.json && node -e \"const fs=require('fs'); fs.mkdirSync('dist/bin',{recursive:true}); fs.copyFileSync('bin/exa-tools','dist/bin/exa-tools.js'); fs.chmodSync('dist/bin/exa-tools.js',0o755)\"",
  "prepack": "npm run build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```
- extend the existing `files` array while preserving the current `!vitest.config.ts` exclusion:
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

This task intentionally does **not** make `tsconfig.json` the primary mechanism for the binary wrapper. `tsc -p tsconfig.json` still builds the root TypeScript sources such as `cli.ts`, and the build script then copies `bin/exa-tools` to `dist/bin/exa-tools.js` and marks it executable.

**Step 2 — Verify**
Run: `npm run build && test -f bin/exa-tools && test -f dist/bin/exa-tools.js && node --input-type=commonjs -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if (pkg.bin['exa-tools'] !== 'dist/bin/exa-tools.js') throw new Error('bin missing');"`
Expected: build succeeds, `bin/exa-tools` and `dist/bin/exa-tools.js` both exist, and `package.json` exposes the `exa-tools` binary

### Task 8: Document standalone CLI installation and usage [no-test] [depends: 7]

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
