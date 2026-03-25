## Task 4: Add fetch subcommand raw markdown output

Step 1 is too weak for AC9. The current assertions only check that stdout *contains* the title/body, so the test would still pass if the CLI kept the extension's file-first preview text (for example `Full content saved to ...`) because the mocked content is short.

Strengthen the success-path assertions so the task proves the standalone CLI prints raw markdown directly to stdout and does **not** use the offload/preview format:

```ts
expect(exitCode).toBe(0);
expect(deps.extractContent).toHaveBeenCalledWith("https://example.com/page");
expect(stdout.join("\n")).toBe("# Example Page\n\nThis is the extracted body.");
expect(stdout.join("\n")).not.toContain("Full content saved to");
expect(stderr).toEqual([]);
```

Keep Step 3 based on `extractContent(url)` from `extract.ts` and `formatFetchedMarkdown(title, content)`. Do **not** introduce `offloadToFile`, temp-file previews, or any dependency on `index.ts` behavior in this task.

## Task 5: Add prompted fetch filtered output path

Step 1 currently proves that `deps.filterContent` is called, but it does **not** prove that the success path stays focused. As written, the test would still pass if `runCli()` printed the filtered answer **and** the full extracted markdown.

Add assertions that the raw extracted markdown is not leaked on the success path:

```ts
expect(exitCode).toBe(0);
expect(deps.filterContent).toHaveBeenCalledWith(
  "# Example Page\n\nLong extracted body.",
  "How do I mock a function?",
);
expect(stdout.join("\n")).toContain("Use `vi.fn()` to create a mock function.");
expect(stdout.join("\n")).not.toContain("Long extracted body.");
expect(stdout.join("\n")).not.toContain("# Example Page");
expect(stderr).toEqual([]);
```

Step 3 should keep the real standalone adapter wiring because `filter.ts` exposes this signature:

```ts
filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn,
): Promise<FilterResult>
```

The default CLI dependency should therefore stay in this shape:

```ts
async function runStandaloneFilter(content: string, prompt: string): Promise<FilterResultLike> {
  const authStorage = new AuthStorage();
  const modelRegistry = new ModelRegistry(authStorage);
  const { filterModel } = getConfig();
  return filterContent(content, prompt, modelRegistry, filterModel, complete);
}
```

## Task 6: Add prompted fetch warning fallback to raw markdown

Step 1 is also too weak for AC11. It only checks that stdout/stderr *contain* the expected strings. That would still pass if the implementation mixed focused output with fallback output or if it printed extra wrapper text.

Make the fallback contract exact:

```ts
expect(exitCode).toBe(0);
expect(stderr.join("\n")).toBe("Warning: No filter model available");
expect(stdout.join("\n")).toBe("# Example Page\n\nLong extracted body.");
```

Keep the note that this task is testing the real `filter.ts` fallback shape:

```ts
vi.mocked(deps.filterContent!).mockResolvedValue({
  filtered: null,
  reason: "No filter model available",
});
```

In Step 3, keep both fallback branches, but make the warning/raw-markdown behavior line up with the stricter assertions above:

```ts
if (deps.filterContent) {
  const filtered = await deps.filterContent(result.content, prompt);
  if (filtered.filtered !== null) {
    io.stdout(/* focused output */);
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

That uses the real `extract.ts` return shape (`{ url, title, content, error }`) and keeps the CLI independent from the extension's temp-file offload path.

## Task 7: Wire package metadata and build output for the standalone binary

This task does not currently cover AC2 correctly. The spec requires the **source entrypoint path** to be `bin/exa-tools`, but the task still creates `bin/exa-tools.ts` and modifies `tsconfig.json` to compile it. That does not satisfy the stated file-path requirement.

Update the task metadata and Step 1 instructions so the created source file is:

```yaml
files_to_create:
  - bin/exa-tools
```

Use an extensionless source entrypoint in Step 1:

```js
#!/usr/bin/env node
import { runCli } from "../cli.js";

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
```

Do **not** keep the current `tsconfig.json` edit as the primary build mechanism. The repo's current `tsconfig.json` already compiles root `*.ts` files, including `cli.ts`, and `tsc` will **not** compile an extensionless `bin/exa-tools` source file. Instead, change the task to describe a build script that:
1. runs `tsc -p tsconfig.json` to emit `dist/cli.js`
2. copies `bin/exa-tools` to `dist/bin/exa-tools.js`
3. makes the copied file executable

A concrete minimal `package.json` script example is:

```json
"scripts": {
  "build": "tsc -p tsconfig.json && node -e \"const fs=require('fs'); fs.mkdirSync('dist/bin',{recursive:true}); fs.copyFileSync('bin/exa-tools','dist/bin/exa-tools.js'); fs.chmodSync('dist/bin/exa-tools.js',0o755)\"",
  "prepack": "npm run build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Keep the `bin` field as:

```json
"bin": {
  "exa-tools": "dist/bin/exa-tools.js"
}
```

Also update Step 2 so the no-test verification checks the real AC2 path pair, not just the built file:

```bash
npm run build && test -f bin/exa-tools && test -f dist/bin/exa-tools.js && node --input-type=commonjs -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if (pkg.bin['exa-tools'] !== 'dist/bin/exa-tools.js') throw new Error('bin missing');"
```

Because the task changes, update the task body text and frontmatter to stop referring to `bin/exa-tools.ts` and `tsconfig.json` as required edits unless you introduce a separate concrete reason for a `tsconfig.json` change.