## Goal
Add a standalone `exa-tools` CLI to `@coctostan/pi-exa-gh-web-tools` so the package can be used directly from shell scripts and agent bash environments, while reusing the package’s existing search, code-search, and content-extraction logic instead of building separate CLI-only implementations.

## Acceptance Criteria
1. `package.json` declares a binary named `exa-tools` that resolves to `dist/bin/exa-tools.js` after build.

2. The repo contains a source CLI entrypoint at `bin/exa-tools` that is included in the build output as `dist/bin/exa-tools.js`.

3. The CLI supports exactly these subcommands for this issue: `search`, `code`, and `fetch`.

4. `exa-tools search "<query>"` executes web search by dispatching to the existing Exa search logic rather than a new CLI-specific search client.

5. `exa-tools search "<query>" --n <count>` accepts a result-count option and passes that count to the existing search path.

6. `exa-tools code "<query>"` executes code search by dispatching to the existing Exa context/code-search logic rather than a new CLI-specific code-search client.

7. `exa-tools code "<query>" --tokens <count>` accepts a token-count option and passes that count to the existing code-search path.

8. `exa-tools fetch "<url>"` executes content extraction by dispatching to the existing extraction pipeline rather than a new CLI-specific extractor.

9. `exa-tools fetch "<url>"` without `--prompt` writes the full extracted markdown for that URL to stdout and does not use the extension’s file-first preview/temp-file output format.

10. `exa-tools fetch "<url>" --prompt "<question>"` attempts focused extraction via the existing prompt/filter flow when a usable filter model is available to the CLI runtime.

11. If `exa-tools fetch "<url>" --prompt "<question>"` cannot use a filter model or filter-model API key, the CLI writes a warning to stderr, writes the raw extracted markdown to stdout, and exits with status code `0`.

12. On successful execution, the CLI exits with status code `0` and writes its primary result as clean markdown to stdout.

13. On invalid usage or execution error, the CLI writes a clear error message to stderr and exits with status code `1`.

14. Commands that require Exa search access (`search` and `code`) read the API key from `EXA_API_KEY`, and if that variable is missing the CLI fails with a clear error message on stderr.

15. The CLI implementation reuses existing lower-level modules for Exa requests and content extraction; this issue must not introduce duplicated Exa HTTP-call logic or a duplicated readability/extraction pipeline in the CLI layer.

16. The CLI can run as a standalone Node entrypoint without depending on Pi tool registration, session lifecycle, result storage, temp-file offloading, or TUI rendering behavior from `index.ts`.

17. Project documentation includes standalone CLI installation and usage guidance, including global installation via `npm install -g @coctostan/pi-exa-gh-web-tools`.

## Out of Scope
- Adding standalone CLI subcommands beyond `search`, `code`, and `fetch`.
- Adding persistent CLI-specific state or extra cache wiring beyond the package’s existing behavior.
- Supporting `--n` as an alias for `exa-tools code`; this issue uses `--tokens` only.
- Reworking the extension-oriented architecture into a broader shared service layer unless a minimal helper extraction is necessary to keep the CLI thin.
- Requiring direct-package usage examples in addition to the required global-install documentation.
- Requiring a `Dockerfile.install` snippet.

## Open Questions
None.

## Requirement Traceability
- `R1 -> AC 1, AC 2`
- `R2 -> AC 1, AC 2`
- `R3 -> AC 3`
- `R4 -> AC 3`
- `R5 -> AC 3`
- `R6 -> AC 4`
- `R7 -> AC 5`
- `R8 -> AC 6`
- `R9 -> AC 7`
- `R10 -> AC 8, AC 9`
- `R11 -> AC 10, AC 11`
- `R12 -> AC 9`
- `R13 -> AC 9, AC 10, AC 12`
- `R14 -> AC 11, AC 13`
- `R15 -> AC 11, AC 12`
- `R16 -> AC 13`
- `R17 -> AC 14`
- `R18 -> AC 14`
- `R19 -> AC 15`
- `R20 -> AC 15, AC 16`
- `R21 -> AC 1, AC 2`
- `R22 -> AC 17`
- `O1 -> Out of Scope`
- `O2 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `D4 -> Out of Scope`
- `C1 -> AC 1, AC 2, AC 3`
- `C2 -> AC 4, AC 6, AC 8, AC 15`
- `C3 -> AC 16`
- `C4 -> AC 9`
- `C5 -> AC 7; Out of Scope`
- `C6 -> AC 4, AC 6, AC 8, AC 14, AC 15`
