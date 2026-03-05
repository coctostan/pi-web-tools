# Learnings — Issue 013: Lean Context (Summary Search + File-First Storage)

## What went well

- **Small surface area, high impact.** The summary-mode switch in `exa-search.ts` was a one-expression ternary change. The `parseExaResults` fallback chain extension was a single `if` line. These were the smallest possible changes to unlock the biggest token reduction (~5–10x per search call). YAGNI held.

- **`FILE_FIRST_PREVIEW_SIZE` as a named constant.** Keeping it separate from `PREVIEW_SIZE` (used by the `tool_result` interceptor) prevented confusion and made intent clear at call sites. When you have two similar-looking values for different purposes, name them distinctly — don't share constants across concerns.

- **Scoped `githubCloneUrls` Set.** Tracking successful GitHub clones at fetch time (in `fetchOne`) rather than re-checking with `parseGitHubUrl(r.url)` at render time was correct design. The URL returned by `extractGitHub` (canonical) may differ from the input URL, and parsing the URL at render time would re-run logic that already ran and potentially mismatch.

- **Try/catch fallback for disk errors.** Wrapping `offloadToFile()` in try/catch and returning inline with a warning is the right pattern for infrastructure-level failures. The agent gets degraded-but-functional output rather than an exception.

- **Mock shape in `index.test.ts`.** Hoisting the offload state and providing all four functions (`shouldOffload`, `offloadToFile`, `buildOffloadResult`, `cleanupTempFiles`) in one mock declaration avoids the risk of partial mock coverage. When mocking a module, mock the full interface — not just what the test being written needs.

## What was surprising

- **The `vi.resetModules()` + dynamic import pattern scales well.** Each tool-registration helper (`getFetchContentTool`, `getWebSearchTool`, `getFetchAndGetSearchContentTools`) re-imports the module fresh. For a registration-based extension pattern (where the module side-effectfully calls `pi.registerTool`), this is the right way to test per-tool behavior in isolation.

- **`configState` mutability enabled multi-tool helper.** Mutating `configState.value.tools` around the `import()` call to enable/disable specific tools was a simple and effective pattern for controlling which tools get registered without needing separate config files or complex mock overrides.

## What to do differently next time

- **Separate file content from response annotation.** The prompt-fallback path wrote `⚠ ${reason}\n\n# title\n\ncontent` to the temp file — embedding the warning into what should be clean page content. The correct pattern: write only the clean content to the file; annotate the response separately. Encode the separation early in the design (e.g., `fileContent` vs `displayText`) to avoid the duplication discovered in code review.

- **Test what the agent reads from the file.** The code-review finding (warning in file) was missed because tests only checked that `offloadToFile` was called, not what was written. Adding `expect(offloadState.offloadToFile.mock.calls[0][0]).not.toMatch(/^⚠/)` would have caught it at the TDD stage. When file content is meaningful (agents read it), test its content too.

- **Multi-URL preview uses the file content start.** Using `fullText.slice(0, FILE_FIRST_PREVIEW_SIZE)` where `fullText = `# title\n\ncontent`` repeats the title in the preview when the title is already shown above. Use `r.content.slice(0, FILE_FIRST_PREVIEW_SIZE)` for more useful preview content. Catch this in the original design doc by specifying exactly what "preview" means (raw content only vs. full formatted text).
