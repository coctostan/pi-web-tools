## Task 4: retryFetch respects AbortSignal (pre-aborted and mid-backoff)

### 1) Fix dependency metadata
Your Step 3 code references `RETRYABLE_STATUS_CODES` and the network-error catch logic introduced by Task 3. With the current frontmatter (`depends_on: [1]`), this task is not runnable in isolation.

Change frontmatter to:

```yaml
depends_on:
  - 3
```

### 2) Make Step 2 failure expectation concrete
Current Step 2 text is explanatory but not an exact failure.

Use:
- Run: `npx vitest run retry.test.ts`
- Expected: `FAIL — AssertionError: expected "spy" to not be called at all, but it was called 1 times`

That maps directly to:

```ts
expect(mockFetch).not.toHaveBeenCalled();
```

### 3) Keep Step 3 minimal (avoid replacing unrelated logic)
Step 3 should only add the early-abort guard at the top of `retryFetch`, not replace the entire function body.

Add exactly this right after `const signal = init?.signal ?? undefined;`:

```ts
if (signal?.aborted) {
  throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}
```

This avoids accidentally regressing Task 3 status-branch behavior.

## Task 5: searchExa uses retryFetch instead of raw fetch

### 1) Address regression in existing `exa-search.test.ts` 429 error test
After `searchExa` switches to `retryFetch`, the existing test:

```ts
mockFetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => "Rate limit exceeded. Please try again later." });
```

is no longer retry-safe. Additional retry attempts will call `fetch` again; in Vitest, unconfigured calls return `undefined`, which leads to `TypeError: Cannot read properties of undefined (reading 'ok')`.

Update that existing fixture to provide a stable response for all retry attempts:

```ts
mockFetch.mockResolvedValue({
  ok: false,
  status: 429,
  text: async () => "Rate limit exceeded. Please try again later.",
});
```

Keep the assertion unchanged (`toThrow("429")`).

### 2) Add this regression note to Step 1 or Step 3
Explicitly mention that this fixture adjustment is required so Step 4 (`npx vitest run exa-search.test.ts`) and Step 5 (`npx vitest run`) remain green after retry integration.

## Task 6: searchContext uses retryFetch instead of raw fetch

### 1) Fix dependency metadata
This task currently depends on Task 1 only, but Step 1 includes a network-error retry test that requires Task 2 behavior, and `exa-context.test.ts` still includes a 400-response error test that relies on Task 3's non-retryable handling.

Change frontmatter to:

```yaml
depends_on:
  - 3
```

(Using Task 3 as the dependency is sufficient because Task 3 already depends on Task 2.)

### 2) Keep Step 2 failure mode explicit to current codebase behavior
Use concrete failure text from current `exa-context.ts` paths:
- `Exa Context API error (429)` for the 429 case
- `Context request failed for query "test query"` for the network-error case

This keeps RED expectations aligned with actual thrown messages in `exa-context.ts`.
