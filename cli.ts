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
