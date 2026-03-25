---
id: 4
title: Add fetch subcommand raw markdown output
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - cli.ts
files_to_create:
  - cli.fetch.raw.test.ts
---

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
