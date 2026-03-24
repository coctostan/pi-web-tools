# Learnings — Issue #023

- **Parallel `push()` ordering is non-deterministic**: When using `Promise.all` with `p-limit` and pushing to a shared array inside each callback, the array order depends on resolution timing, not input order. Tests should use `.find()` by key instead of assuming index positions.
- **Scope existing work before planning**: The multi-URL+prompt feature was already fully implemented. Recognizing this early narrowed the issue to a ptcValue shape polish instead of building new functionality — saved significant planning time.
- **Minimal per-branch shapes beat union types with nulls**: Pushing `{ url, answer, contentLength }` for success vs `{ url, error }` for errors is cleaner than a 7-field union where most fields are null. Consumers can pattern-match on field presence.
- **`Record<string, unknown>` trades type safety for flexibility**: The discriminated shapes per branch are correct but not compile-time enforced. Tests with `Object.keys().sort()` assertions compensate, but a proper discriminated union type would be better for long-term maintainability.
- **Edit tool can drop lines when replacing large blocks**: The initial edit missed a `const fullText = ...` line that was in the middle of the replaced range, causing a `ReferenceError` at runtime. Always re-read the modified section after large range replacements.
