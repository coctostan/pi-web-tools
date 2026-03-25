## Goal
Add a standalone `exa-tools` CLI to `@coctostan/pi-exa-gh-web-tools` so the package can be used directly from shell scripts and agent bash environments, while reusing the existing Exa search, code search, and content extraction logic instead of duplicating it.

## Mode
Direct requirements

The requested behavior is already concrete: binary name, subcommands, output channels, exit codes, API key source, reuse expectations, packaging target, and documentation requirements are all specified. The only material ambiguities were CLI output behavior for raw fetches and the `code` command option name, and those have now been resolved.

## Must-Have Requirements
R1. The package must expose a standalone CLI binary named `exa-tools`.

R2. The package must add a CLI entry point at `bin/exa-tools` and package it via `package.json` so the binary is available after install.

R3. The CLI must provide a `search` subcommand.

R4. The CLI must provide a `code` subcommand.

R5. The CLI must provide a `fetch` subcommand.

R6. `exa-tools search "<query>"` must execute web search using the package’s existing Exa search logic.

R7. `exa-tools search "<query>" [--n <count>]` must support a result-count option for search.

R8. `exa-tools code "<query>"` must execute code search using the package’s existing Exa context/code-search logic.

R9. `exa-tools code "<query>" [--tokens <count>]` must support a token-count option for code search.

R10. `exa-tools fetch "<url>"` must execute content fetch/extraction using the package’s existing extraction pipeline.

R11. `exa-tools fetch "<url>" [--prompt "<question>"]` must support focused extraction via the existing prompt/filter flow.

R12. `exa-tools fetch "<url>"` without `--prompt` must print the full extracted markdown to stdout.

R13. Successful command output must be written to stdout in clean markdown.

R14. Error output must be written to stderr.

R15. The CLI must exit with status code `0` on success.

R16. The CLI must exit with status code `1` on error.

R17. The CLI must read the Exa API key from the `EXA_API_KEY` environment variable.

R18. If `EXA_API_KEY` is missing for a command that requires it, the CLI must fail with a clear error message.

R19. The CLI implementation must reuse existing core logic from the package and must not duplicate Exa API call code or the readability/content extraction pipeline.

R20. The CLI implementation must remain thin and primarily handle argument parsing, command dispatch, formatting, and process exit behavior.

R21. The CLI implementation must compile to `dist/bin/exa-tools.js`.

R22. The project documentation must include installation/usage guidance for the standalone CLI, including global install via npm.

## Optional / Nice-to-Have
O1. Document CLI installation with both npm global install and direct package usage examples.

O2. Include a Dockerfile.install snippet in addition to or instead of a README CLI install section, if that fits the existing docs better.

## Explicitly Deferred
D1. Adding new standalone CLI subcommands beyond `search`, `code`, and `fetch`.

D2. Adding persistent CLI-specific state or extra cache wiring beyond the package’s existing behavior.

D3. Supporting a `--n` alias for the `code` subcommand; the current slice uses `--tokens` instead.

D4. Reworking the extension-oriented architecture into a broader shared service layer unless required to keep the CLI thin.

## Constraints
C1. The repo currently has no standalone CLI implementation, no existing argument parser, and no `bin` entry in `package.json`; this work is additive.

C2. The CLI should extend existing lower-level modules such as `exa-search.ts`, `exa-context.ts`, `extract.ts`, and `config.ts` rather than routing through Pi tool registration in `index.ts`.

C3. The CLI must not depend on Pi session lifecycle, tool storage, temp-file offloading, or TUI rendering behavior that exists for extension tools.

C4. CLI raw fetch behavior differs intentionally from the Pi extension’s file-first raw fetch behavior: the CLI must print full extracted markdown to stdout for `fetch` without `--prompt`.

C5. `code` command option naming is constrained to `--tokens`, not `--n`.

C6. The implementation should preserve current package behavior where practical, including existing API key/config loading logic and existing network/extraction behavior.

## Open Questions
None.

## Recommended Direction
Implement the CLI as a thin Node entrypoint under `bin/` that parses argv, validates subcommand arguments, loads config/API key through existing config behavior, and dispatches directly to the existing lower-level modules. This keeps the CLI independent from Pi-specific registration, storage, TUI rendering, and session hooks in `index.ts`, which are the wrong abstraction for shell use.

For `search`, call the existing Exa search path and format results as clean markdown similar to the current tool output, but without Pi wrapper text that only makes sense for interactive tool use. For `code`, call the existing Exa context search path and expose `--tokens` as the CLI control that maps directly to the underlying `tokensNum` parameter. For `fetch`, call the existing extraction path and, when `--prompt` is provided, reuse the current focused-answer filtering flow; otherwise print the full extracted markdown instead of the extension’s file-first preview behavior.

Because the current architecture is extension-first, the spec phase should decide whether a small shared formatting/helper module is warranted so the CLI does not copy too much formatting logic from `index.ts`. That refactor should stay minimal and only happen where needed to keep the CLI thin and avoid duplicating Exa or extraction behavior.

Documentation should be updated alongside implementation so the package clearly supports both Pi extension installation and standalone CLI usage. The README is the most direct place for this; a Dockerfile.install snippet is acceptable if it already fits the repo’s documentation patterns.

## Testing Implications
- Verify each subcommand parses expected positional arguments and supported flags.
- Verify `search` passes result count correctly via `--n`.
- Verify `code` passes token count correctly via `--tokens`.
- Verify `fetch` without `--prompt` writes full extracted markdown to stdout.
- Verify `fetch --prompt` returns focused output rather than raw full content.
- Verify successful runs exit `0` and failures exit `1`.
- Verify errors are emitted on stderr, not stdout.
- Verify missing `EXA_API_KEY` produces a clear failure for commands that require it.
- Verify the CLI reuses existing core behavior rather than introducing separate network logic.
- Verify package/build metadata exposes the compiled binary at `dist/bin/exa-tools.js`.
- Verify README or install docs cover standalone CLI installation and usage.
