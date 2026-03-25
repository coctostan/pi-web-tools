# Feature: Standalone `exa-tools` CLI

## Summary

Added a standalone `exa-tools` CLI binary to `@coctostan/pi-exa-gh-web-tools` so the package can be used directly from shell scripts and agent bash environments without requiring Pi tool registration or session lifecycle.

## Motivation

The package's web search, code search, and content extraction capabilities were previously only accessible through Pi's extension API. A standalone CLI enables direct use from any terminal, shell script, or agent environment — broadening the package's utility beyond Pi-specific workflows.

## What Was Built

### CLI Module (`cli.ts`)
- `runCli(argv, io?, deps?)` — main entry point with dependency injection for testability
- Three subcommands: `search`, `code`, `fetch`
- Clean stdout/stderr separation: results to stdout, errors/warnings to stderr
- Graceful degradation: prompted fetch falls back to raw markdown when no filter model is available

### Binary Entrypoint (`bin/exa-tools`)
- Minimal shim that bridges `process.argv` to `runCli()`
- Uses `process.exitCode` instead of `process.exit()` to avoid killing async work

### Build Pipeline
- `npm run build` compiles TypeScript and copies the binary to `dist/bin/exa-tools.js`
- `prepack` hook ensures build runs before publish
- `package.json` `bin` field maps `exa-tools` → `dist/bin/exa-tools.js`

### Commands

| Command | Description |
|---------|-------------|
| `exa-tools search "<query>" [--n <count>]` | Web search via Exa API |
| `exa-tools code "<query>" [--tokens <count>]` | Code search via Exa context API |
| `exa-tools fetch "<url>"` | Extract page content as markdown |
| `exa-tools fetch "<url>" --prompt "<question>"` | Focused extraction with filter model |

### Key Design Decisions

1. **Dependency injection over module mocking** — `CliDeps` and `CliIO` interfaces make tests fast and deterministic without vitest module mocks.
2. **No duplicated HTTP logic** — CLI delegates all network operations to existing `exa-search.ts`, `exa-context.ts`, and `extract.ts` modules.
3. **No Pi runtime dependency** — CLI imports only the lower-level modules, not `index.ts`, `storage.ts`, `offload.ts`, or any Pi/TUI APIs.
4. **Graceful filter degradation** — `defaultDeps` omits `filterContent` since the pi filter pipeline requires peer dependencies that may not be available in a global install. The CLI warns and falls back to raw markdown.

## Files Changed

| File | Change |
|------|--------|
| `cli.ts` | New — core CLI module (195 lines) |
| `bin/exa-tools` | New — binary entrypoint (5 lines) |
| `turndown.d.ts` | New — type declaration for tsc build |
| `package.json` | Modified — `bin`, `files`, `build`/`prepack` scripts |
| `README.md` | Modified — standalone CLI documentation section |
| `cli.usage.test.ts` | New — 2 tests |
| `cli.search.test.ts` | New — 2 tests |
| `cli.code.test.ts` | New — 2 tests |
| `cli.fetch.raw.test.ts` | New — 2 tests |
| `cli.fetch.prompt.filtered.test.ts` | New — 1 test |
| `cli.fetch.prompt.fallback.test.ts` | New — 2 tests |

## Test Coverage

11 new tests across 6 test files. Full suite: 258 tests passing.
