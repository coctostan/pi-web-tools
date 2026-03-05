# Learnings — 012-haiku-filter-on-fetch-content

- **Inject the `complete` function as a parameter, not a module-level import in the filter function.** `filterContent` takes `completeFn: CompleteFn` rather than importing `complete` directly. This makes unit tests trivial — just pass a `vi.fn()` — without any module mocking overhead. The same principle applies to `ModelRegistry`: inject it rather than reaching for a global.

- **`vi.hoisted()` is the right tool for mocks that must exist before `vi.mock()` factory evaluation.** The `state` object (holding `extractContent` and `filterContent` spies) needs to be set up before the mock factories run. `vi.hoisted()` guarantees this. Getting this wrong causes `ReferenceError: Cannot access 'state' before initialization` at test time.

- **The multi-URL fallback path was missing truncation — a real oversight caught in code review.** The single-URL path had explicit truncation at `MAX_INLINE_CONTENT` (30K chars) and a `get_search_content` reference. The multi-URL path silently omitted this. Always verify symmetry between single-URL and multi-URL code paths when adding new behavior to both.

- **Discriminated unions beat boolean flags.** `FilterResult = { filtered: string; model: string } | { filtered: null; reason: string }` forces callers to handle both success and failure shapes via narrowing (`if (filterResult.filtered)`). A design with `{ filtered: string | null; model?: string; reason?: string }` would allow invalid states and require explicit null checks on multiple fields.

- **Redundant checks in type guards are worth noting but rarely worth fixing.** The `!("apiKey" in resolved)` guard alongside `!resolved.model` was flagged as redundant — but it adds zero risk and some defensive value. The energy is better spent on higher-impact issues (like the truncation bug). Note it, move on.

- **The `MinimalModel` local type pattern has a tradeoff.** Using `type MinimalModel = { id: string; provider: string }` in `filter.ts` avoids importing `Model<Api>` from the heavy pi-ai package, keeping the module portable. But it requires a type cast (`resolved as { model: Model<Api>; apiKey: string }`) at the call site. If the `Model<Api>` interface changes, the cast will silently lie. A JSDoc comment explaining why the cast is safe would help future readers.

- **Write the error fallback test before the happy path test.** If you test the success case first, it's easy to miss that error cases aren't handled (e.g. the `try/catch` around `completeFn` was a separate task). Writing failure tests early forces the implementation to be defensive from the start.
