## Task 2: retryFetch retries on network errors (TypeError)

Step 2 is not valid TDD right now.

Current text (wrong):
- `Expected: PASS — these tests should already pass ...`

This must be RED with a concrete failure.

Use this instead:
- Run: `npx vitest run retry.test.ts`
- Expected: `FAIL — expected "spy" to be called 2 times, but got 1 times` (for the retry assertions)

Step 3 also cannot be `No implementation changes needed`.
This task must contain the network-error retry implementation in `retry.ts`.

Use this catch-branch logic in Step 3:

```ts
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) {
        throw lastError;
      }

      const isNetworkError =
        lastError instanceof TypeError &&
        (lastError.message.includes("fetch failed") ||
         lastError.message.includes("ECONNRESET") ||
         lastError.message.includes("ETIMEDOUT"));

      if (!isNetworkError) {
        throw lastError;
      }
    }
```

Important: as currently written, Task 1 already includes this behavior, so Task 2 never goes RED. Re-scope Task 1/Task 2 boundaries so Task 2 introduces this logic.

## Task 3: retryFetch does not retry on non-retryable HTTP status codes

Step 2 is also not valid TDD right now.

Current text (wrong):
- `Expected: PASS — the Task 1 implementation already returns non-retryable responses immediately ...`

This must be RED with a concrete failure.

Use this instead:
- Run: `npx vitest run retry.test.ts`
- Expected: `FAIL — expected "spy" to be called 1 times, but got 3 times` (for 400/401/403/404 tests)

Step 3 cannot be `No implementation changes needed`.
This task must add explicit non-retryable short-circuit behavior.

Use this in `retry.ts` Step 3:

```ts
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

// inside the fetch success path
if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
  return response;
}

if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
  lastResponse = response;
  continue;
}

return response;
```

Important: same root issue as Task 2 — Task 1 currently pre-implements this behavior, so Task 3 cannot be RED as written. Re-scope Task 1/Task 3 boundaries accordingly.

## Task 7: Batch web_search executes queries concurrently via p-limit(3)

Step 1 test code uses APIs/variables that do not exist in this repo (`registeredTools`, `mockContext`, and `handler.execute({ input: ... })`).

In `index.test.ts`, use the existing helper and execute signature:

```ts
const { webSearchTool } = await getWebSearchTool();
await webSearchTool.execute("call-batch", { queries: ["q1", "q2", "q3"] });
```

Also fix the partial-failure assertions: `index.ts` renders success text from `formatSearchResults(searchResults)`, so you must mock `exaState.formatSearchResults` or your `Result 1/Result 3` assertions will fail regardless of implementation.

Use this pattern in Step 1:

```ts
exaState.formatSearchResults
  .mockReturnValueOnce("Result 1 formatted")
  .mockReturnValueOnce("Result 3 formatted");

const result = await webSearchTool.execute("call-partial", { queries: ["q1", "q2", "q3"] });
const text = getText(result);
expect(text).toContain("## Query: q1");
expect(text).toContain("Result 1 formatted");
expect(text).toContain("## Query: q2");
expect(text).toContain("Error: Exa API error (503)");
expect(text).toContain("## Query: q3");
expect(text).toContain("Result 3 formatted");
```

## Task 8: Multi-URL fetch_content uses p-limit(3) for bounded concurrency

Step 1 has the same API mismatch as Task 7 (`registeredTools`, object-style execute call). That will fail before testing concurrency.

Use the existing helper and execute signature from `index.test.ts`:

```ts
const { fetchContentTool } = await getFetchContentTool();
const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;

await fetchContentTool.execute(
  "call-multi",
  { urls: ["https://example.com/1", "https://example.com/2", "https://example.com/3"] },
  undefined,
  undefined,
  ctx
);
```

Keep the assertions on `pLimitState.pLimitSpy` and `state.extractContent` call count, but ensure the test is added under an actual existing describe block (`fetch_content ...` sections in `index.test.ts`), not a non-existent `describe("fetch_content", ...)` block.
