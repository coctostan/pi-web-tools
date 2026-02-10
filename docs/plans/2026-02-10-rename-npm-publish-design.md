# Rename to @coctostan/pi-exa-gh-web-tools & NPM Publish Readiness

**Date:** 2026-02-10

## Decisions

- **Package name:** `@coctostan/pi-exa-gh-web-tools` (scoped)
- **Repo name:** `github.com/coctostan/pi-exa-gh-web-tools`
- **Source layout:** Flat at root (pi convention — ship .ts, no build step)
- **Pi convention:** Extensions loaded via jiti, no compilation needed

## Scope

### 1. Rename

- `package.json` name → `@coctostan/pi-exa-gh-web-tools`
- Repository URL → `github.com/coctostan/pi-exa-gh-web-tools`
- Update any internal references to the old name

### 2. package.json for NPM Publish

```json
{
  "name": "@coctostan/pi-exa-gh-web-tools",
  "version": "1.0.0",
  "description": "Web search via Exa, content extraction, and GitHub repo cloning for Pi coding agent",
  "type": "module",
  "keywords": ["pi-package", "pi", "pi-coding-agent", "extension", "web-search", "exa", "fetch", "github"],
  "author": "coctostan",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/coctostan/pi-exa-gh-web-tools.git"
  },
  "files": [
    "*.ts",
    "!*.test.ts",
    "!vitest.config.ts",
    "LICENSE",
    "README.md"
  ],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

Key points:
- `files` whitelist — only source .ts (excluding tests), LICENSE, README
- `peerDependencies` for pi core packages with `"*"` range
- No build scripts needed (jiti loads .ts directly)
- Version 1.0.0

### 3. Error Handling Hardening

- Type-validate Exa API response shape (guard against malformed responses)
- Clean up partial git clones on failure (finally block)
- Wrap network errors with user-friendly context messages

### 4. Test Gaps to Fill

- Malformed Exa API response handling
- `dedupeUrls` and tool param validation in index.ts
- GitHub clone timeout / oversized repo rejection / partial clone cleanup
- Jina Reader fallback path in extract.ts

### 5. README Rewrite

Structure:
1. Banner image (`assets/banner.jpg`)
2. One-liner description
3. Install — `pi install npm:@coctostan/pi-exa-gh-web-tools`
4. Configuration — `EXA_API_KEY`, optional `~/.pi/web-tools.json`
5. Tools — `web_search`, `fetch_content`, `get_search_content` with param tables
6. GitHub extraction behavior
7. Development — `npm test`, `npm run test:watch`
8. License

### 6. Tarball Contents

**Included (via `files`):**
- `*.ts` (excluding `*.test.ts`, `vitest.config.ts`)
- `LICENSE`, `README.md`

**Excluded (kept in git only):**
- `docs/`, `todo.md`, `*.test.ts`, `vitest.config.ts`, `tsconfig.json`, `assets/`
