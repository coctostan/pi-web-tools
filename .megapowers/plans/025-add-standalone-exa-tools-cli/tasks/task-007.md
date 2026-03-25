---
id: 7
title: Wire package metadata and build output for the standalone binary
status: approved
depends_on:
  - 6
no_test: true
files_to_modify:
  - package.json
files_to_create:
  - bin/exa-tools
---

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
