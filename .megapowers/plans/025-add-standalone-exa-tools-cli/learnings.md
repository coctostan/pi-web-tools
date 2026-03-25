# Learnings — 025-add-standalone-exa-tools-cli

- **Dependency injection beats module mocking for CLI testing.** The `CliDeps`/`CliIO` interfaces made every test a simple function call with mock objects — no `vi.mock()`, no module-level setup, no test ordering issues. Tests run in ~2ms each.

- **Graceful degradation > hard requirements for optional features.** The plan originally wired `runStandaloneFilter` with `AuthStorage`/`ModelRegistry` as the default, but those are peer deps that may not resolve in a global install. Omitting `filterContent` from `defaultDeps` and falling back to raw markdown with a warning is more robust and still satisfies the spec (AC10/AC11).

- **Pre-existing build issues surface when you add a build step.** The project never ran `tsc` before (vitest handles TS natively). Adding `npm run build` exposed a missing `turndown` type declaration. A minimal `.d.ts` shim was the pragmatic fix; `@types/turndown` would be cleaner long-term.

- **TDD guard interaction with already-passing tests needs care.** Task 6's initial test passed immediately because Task 5 already implemented the fallback path. Adding a second test case (custom reason forwarding) created a genuine RED that proved the reason-plumbing was missing. Always check whether the behavior actually needs new code.

- **`process.exitCode` is better than `process.exit()` for async CLIs.** The binary entrypoint sets `process.exitCode` instead of calling `process.exit()`, which lets Node drain any pending async work (timers, streams) before terminating. Small detail that prevents subtle issues.

- **Keep the build script simple even if it's a long one-liner.** The `tsc && node -e "copy bin"` approach in `package.json` avoids adding a separate build script file for what is fundamentally two steps. Trade-off: readability in `package.json` is poor, but the logic is trivial and self-contained.
