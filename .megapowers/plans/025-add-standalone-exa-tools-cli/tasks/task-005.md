---
id: 5
title: Add prompted fetch filtered output path
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - cli.ts
files_to_create:
  - cli.fetch.prompt.filtered.test.ts
---

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
