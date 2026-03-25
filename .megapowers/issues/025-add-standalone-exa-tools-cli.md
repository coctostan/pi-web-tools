---
id: 25
type: feature
status: in-progress
created: 2026-03-25T02:27:30.949Z
---
# Add standalone exa-tools CLI
Add a CLI interface to `@coctostan/pi-exa-gh-web-tools` so it can be used as a standalone binary from shell scripts and AI agent bash tools.

Goals:
- Add a `bin/exa-tools` CLI entry point to the existing package
- Three subcommands: `search`, `code`, `fetch`
- Output clean markdown to stdout, errors to stderr
- Exit 0 on success, 1 on error
- API key from `EXA_API_KEY` env var with a clear failure message if missing

Commands:
- `exa-tools search "<query>" [--n <count>]`
- `exa-tools code "<query>" [--n <count>]`
- `exa-tools fetch "<url>" [--prompt "<question>"]`

Implementation notes:
- Reuse existing core logic from the package; do not duplicate Exa calls or readability pipeline
- Keep the CLI thin; just argument parsing + existing functions
- TypeScript compiled to `dist/bin/exa-tools.js`
- Add package.json bin entry
- Add Dockerfile.install snippet or README section showing `npm install -g @coctostan/pi-exa-gh-web-tools`
- Keep CLI stateless; no extra caching wiring needed
