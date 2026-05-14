# Revise instructions — iteration 1

Only Task 8 needs changes. Everything else is approved.

## Task 8: Empty/whitespace subcommand defaults to help

**Problem.** After Task 7 lands, `dispatch("")` already emits a notify whose
message is:

```
Unknown subcommand: "". Try /web-tools help.

/web-tools subcommands:
  stats          ...
  clear-cache    ...
  purge-expired  ...
  recent         ...
  help           ...
```

That message contains `"stats"`, `"clear-cache"`, `"purge-expired"`, `"recent"`,
and is under 20 lines, so every assertion in Step 1 already passes against the
Task-7 implementation. Step 2 cannot produce a real failing test, which breaks
TDD. The task itself acknowledges this ("depending on Task 7's exact wording
the assertion `toContain('stats')` may still pass").

**Fix.** Tighten the Step 1 test so it distinguishes the help path from the
unknown-subcommand path. Concretely:

1. Assert the message does **not** start with / contain `Unknown subcommand`.
2. Assert the `notify` severity is `"info"` (help), not `"warning"` (unknown).

Replace Step 1 in `task-008.md` with:

```ts
describe("dispatch(empty)", () => {
  it("empty or whitespace-only subcommand behaves like help (not unknown)", async () => {
    const deps = makeDeps();
    await dispatch("", "", deps);
    await dispatch("   ", "", deps);
    expect(deps.notify).toHaveBeenCalledTimes(2);
    for (const call of (deps.notify as any).mock.calls) {
      const msg = call[0] as string;
      const type = call[1];
      // Help-path message: does NOT start with the unknown-subcommand prefix
      expect(msg).not.toMatch(/unknown subcommand/i);
      // notify severity for help is "info", not "warning"
      expect(type ?? "info").toBe("info");
      expect(msg).toContain("stats");
      expect(msg).toContain("clear-cache");
      expect(msg).toContain("purge-expired");
      expect(msg).toContain("recent");
      expect(msg.split("\n").length).toBeLessThanOrEqual(20);
    }
  });
});
```

Then update Step 2's expected failure to something accurate, e.g.:

```
Expected: FAIL — AssertionError: expected 'Unknown subcommand: "". Try /web-tools help.\n\n...' not to match /unknown subcommand/i
```

Step 3, 4, 5 can stay as written — the implementation that routes empty/`help`
to the `info`-severity help notify is what makes the new assertions go green.
