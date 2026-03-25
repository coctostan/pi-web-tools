# Code Review — 025-add-standalone-exa-tools-cli

## Files Reviewed

| File | Description |
|------|-------------|
| `cli.ts` (new, 195 lines) | Core CLI module — `runCli()` with DI for IO and deps |
| `bin/exa-tools` (new, 5 lines) | Standalone binary entrypoint |
| `turndown.d.ts` (new, 7 lines) | Type declaration to unblock `tsc` build |
| `package.json` (modified) | `bin`, `files`, `build`/`prepack` scripts |
| `README.md` (modified) | Standalone CLI section added |
| `cli.usage.test.ts` (new, 41 lines) | Tests: no-args usage, unknown command |
| `cli.search.test.ts` (new, 70 lines) | Tests: search dispatch, missing API key |
| `cli.code.test.ts` (new, 68 lines) | Tests: code dispatch, missing API key |
| `cli.fetch.raw.test.ts` (new, 62 lines) | Tests: raw fetch stdout, error handling |
| `cli.fetch.prompt.filtered.test.ts` (new, 59 lines) | Tests: prompted fetch with filter |
| `cli.fetch.prompt.fallback.test.ts` (new, 79 lines) | Tests: filter fallback with reason forwarding |

## Strengths

- **Clean dependency injection** (`cli.ts:16-22`): `CliDeps` and `CliIO` interfaces make every external call mockable without module-level mocking. Tests are fast and deterministic.
- **Proper separation of concerns** (`cli.ts:1-3`): Only three imports from existing modules — no duplication of HTTP or extraction logic.
- **Graceful degradation** (`cli.ts:173-185`): The filter fallback path handles both "filter returned null" and "no filter dep" cases, forwarding the reason string when available.
- **Error handling** (`cli.ts:189-193`): Top-level try/catch converts all thrown errors to stderr + exit 1, preventing unhandled rejections.
- **Test structure**: Each test file covers a single concern with `makeIo()`/`makeDeps()` helpers that are consistent across files. The fallback test at `cli.fetch.prompt.fallback.test.ts:62-78` specifically tests reason-forwarding — not just the happy path.
- **Binary entrypoint** (`bin/exa-tools`): Minimal — just bridges `process.argv` to `runCli()`, uses `process.exitCode` instead of `process.exit()` (avoids killing in-flight async work).

## Findings

### Critical
None.

### Important
None.

### Minor

1. **`cli.ts:187` — Dead code path.** After `if (command === "search")`, `if (command === "code")`, `if (command === "fetch")`, and given `isKnownCommand` only allows those three, line 187 (`io.stderr("${command} is not implemented yet.")`) is unreachable. Harmless defensive code, but could be replaced with an exhaustiveness assertion if desired. Not worth changing now.

2. **`turndown.d.ts` — Minimal type stub.** The `TurndownService` declaration only types `constructor` and `turndown()`. If other methods are used elsewhere, they'd silently lack type checking. However, this is a pragmatic fix for the build and the existing code only uses those two. Fine as-is; could be replaced with `@types/turndown` later.

3. **`package.json` build script** — The inline `node -e "..."` for copying `bin/exa-tools` to `dist/bin/exa-tools.js` is a long one-liner. Works correctly but could be a small script file for readability. Not worth changing for this issue.

4. **`defaultDeps` omits `filterContent`** (`cli.ts:29-34`): Means standalone `exa-tools fetch --prompt` always falls back to raw markdown. This is the correct behavior — the pi filter pipeline requires `AuthStorage`/`ModelRegistry` which are peer deps and may not be available in a global install. The graceful degradation matches AC10/AC11. If standalone filtering is wanted later, it would be a separate issue.

## Recommendations

- **Future**: Consider `@types/turndown` as a dev dependency to replace the hand-rolled `.d.ts`.
- **Future**: If more subcommands are added, the parse functions could be generalized into a small arg-parser utility. For three commands, the current approach is appropriately sized.

## Assessment
**ready**

The implementation is clean, well-tested (11 tests across 6 files), properly separated from the extension architecture, and handles all edge cases specified in the acceptance criteria. No critical or important issues found. The code follows existing project patterns (ES modules, vitest, dependency injection for testability).
