## Task 5: Export clearUrlCache() from extract.ts and verify it clears the cache

Step 2’s expected failure message is incorrect for this repo’s test runner setup.

- Current text says the failure will be TypeScript compile error:
  `error TS2305: Module '"./extract.js"' has no exported member 'clearUrlCache'`
- But `npx vitest run extract.test.ts` does **not** run `tsc`; this fails at module load time.

Use this expectation instead:

```text
Expected: FAIL — module import error for missing named export `clearUrlCache` from "./extract.js"
(e.g. "does not provide an export named 'clearUrlCache'" / "No matching export")
```

Keep the command the same (`npx vitest run extract.test.ts`), just correct the expected failure mode.

## Task 6: Call clearUrlCache() in onSessionStart in index.ts

The new session lifecycle test currently calls the handler with an invalid context object:

```ts
await handler({}, {});
```

`handleSessionStart()` calls `restoreFromSession(ctx)`, and `restoreFromSession` requires `ctx.sessionManager.getEntries()`.

Replace that invocation with a valid stub context:

```ts
const ctx = {
  sessionManager: {
    getEntries: () => [],
  },
};

await handler({}, ctx as any);
```

Then keep the assertion:

```ts
expect(state.clearUrlCache).toHaveBeenCalled();
```

Also update Step 2 expected failure accordingly. With a valid context, the failure before implementation should be the assertion failure (clearUrlCache not called), **not** a TypeError about `sessionManager`/`getEntries` being undefined.
