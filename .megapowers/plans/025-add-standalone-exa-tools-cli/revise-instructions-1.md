## Task 5: Add prompted fetch filtered output path

Step 3 currently invents a new CLI-only filter signature:

```ts
filterContent?: (content: string, prompt: string) => Promise<FilterResultLike>
```

That does not match the existing lower-level API in `filter.ts`:

```ts
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn,
): Promise<FilterResult>
```

Because `defaultDeps` still omits `filterContent`, the real `exa-tools fetch <url> --prompt ...` binary would always fall back and would never satisfy AC10 when a model is available.

Revise Step 3 so the standalone CLI wires a real default filter adapter using the existing filter flow without going through `index.ts`:

```ts
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { complete } from "@mariozechner/pi-ai";
import { getConfig } from "./config.js";
import { filterContent } from "./filter.js";
```

Add a helper like:

```ts
async function runStandaloneFilter(content: string, prompt: string): Promise<FilterResultLike> {
  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);
  const { filterModel } = getConfig();
  return filterContent(content, prompt, modelRegistry, filterModel, complete);
}
```

Then `defaultDeps` must include that helper:

```ts
const defaultDeps: CliDeps = {
  searchExa,
  formatSearchResults,
  searchContext,
  extractContent,
  filterContent: runStandaloneFilter,
};
```

Keep the command test, but make the task text explicit that the implementation must wire the real default dependency, not only support an injected stub.

## Task 6: Add prompted fetch warning fallback to raw markdown

This task inherits the Task 5 wiring problem. Its fallback logic is only correct if Task 5 first installs a real default `filterContent` path.

Revise Step 1 and Step 3 so the warning path preserves the real `reason` returned by `filter.ts` and still exits `0` with raw markdown on stdout.

Use the actual no-model shape from `filter.ts` (`{ filtered: null, reason: string }`) and keep the stderr message derived from that reason:

```ts
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
```

Also update the task text so Step 1 explicitly says the fallback covers both:
- filter model resolution returning `{ filtered: null, reason: ... }`
- no usable default filter dependency/runtime path

That makes AC11 executable instead of only testing a mocked branch.

## Task 7: Wire package metadata and build output for the standalone binary

Two concrete problems need correction.

### 1. Preserve the existing publish exclusion
The proposed `package.json` rewrite drops the current exclusion for `vitest.config.ts` from `package.json`.

Current repo state:

```json
"files": [
  "*.ts",
  "!*.test.ts",
  "!vitest.config.ts",
  "LICENSE",
  "README.md"
]
```

Your revised `files` block must keep that exclusion while adding the built output and bin files. For example:

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

### 2. Make AC2 explicit in the task text
AC2 requires the source CLI entrypoint under `bin/` and the built artifact at `dist/bin/exa-tools.js`. The task text currently only says `bin/exa-tools.ts`, which leaves the acceptance-criteria path ambiguous.

Revise the task wording so it explicitly states that the `bin/` source entrypoint is what compiles to `dist/bin/exa-tools.js`, and keep the verification command focused on that exact artifact:

```bash
npm run build && test -f dist/bin/exa-tools.js && node --input-type=commonjs -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if (pkg.bin['exa-tools'] !== 'dist/bin/exa-tools.js') throw new Error('bin missing');"
```

Do not rewrite the entire `package.json` snippet in a way that accidentally removes unrelated existing fields/exclusions. Keep the change minimal and anchored to the current file.