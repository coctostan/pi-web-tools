## Task 2: Add rule-based query enhancement helpers

Two changes are needed.

### 1) Make the version-preservation test use a real version string
The current test:

```ts
it("preserves an explicit version string when expanding a vague coding query", () => {
  const result = enhanceQuery("react 19 hooks");

  expect(result.finalQuery).toContain("react");
  expect(result.finalQuery).toContain("19");
});
```

is too weak for AC4. Replace it with an exact version-token check:

```ts
it("preserves an explicit version string when expanding a vague coding query", () => {
  const result = enhanceQuery("react v19.2 hooks");

  expect(result.finalQuery).toBe("react v19.2 hooks docs example");
  expect(result.finalQuery).toContain("v19.2");
});
```

### 2) Narrow the error-like matcher and add a negative control test
The current Step 3 implementation uses:

```ts
return /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Error|Exception)\b/.test(query)
  || /Cannot\s+read\s+properties/i.test(query)
  || /\bat\s+.+\(.+\)/.test(query);
```

This is too broad: a normal query like `React Error Boundary docs` would incorrectly flip to keyword search just because it contains the bare word `Error`.

Add this test to `smart-search.test.ts`:

```ts
it("does not force keyword search for generic title-cased queries that merely mention Error", () => {
  const original = "React Error Boundary docs";
  const result = enhanceQuery(original);

  expect(result.typeOverride).toBeUndefined();
  expect(result.finalQuery).toBe(original);
  expect(result.queryChanged).toBe(false);
  expect(result.appliedRules).toEqual([]);
});
```

Then replace `looksErrorLike()` with a narrower rule set:

```ts
function looksErrorLike(query: string): boolean {
  return /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError)\s*:/i.test(query)
    || /Cannot\s+read\s+properties/i.test(query)
    || /\b[a-zA-Z_$][\w$]*\s+is\s+not\s+(?:defined|a function)\b/i.test(query)
    || /^\s*at\s+\S.+$/m.test(query);
}
```

This still catches clear stack-trace / runtime-error queries, but it stops treating every title-cased `Error` mention as error-like.

## Task 3: Add result dedup and snippet cleanup post-processing
Task 3 needs explicit malformed-entry coverage for AC17, and the implementation must fail open **per entry**, not for the whole batch.

### 1) Add a malformed-entry test
Append this test to the `describe("postProcessResults", ...)` block in `smart-search.test.ts`:

```ts
it("skips malformed result entries and continues processing later results", () => {
  const input = [
    {
      title: "Broken entry",
      url: 42 as any,
      snippet: undefined as any,
    },
    {
      title: "Canonical",
      url: "https://example.com/reference",
      snippet: "Reference docs.",
    },
    {
      title: "Canonical Duplicate",
      url: "https://example.com/reference?utm_campaign=spring",
      snippet: "Reference docs duplicate.",
    },
  ] as unknown as ExaSearchResult[];

  const result = postProcessResults(input);

  expect(result.results).toHaveLength(2);
  expect(result.results[0]).toMatchObject({
    title: "Broken entry",
    url: "",
    snippet: "",
  });
  expect(result.results[1].title).toBe("Canonical");
  expect(result.duplicatesRemoved).toBe(1);
});
```

### 2) Update Step 2 expected failure
With that test in place, the current implementation will fail inside `cleanSnippet(result.snippet)`.
Use this expected failure text:

```txt
Expected: FAIL — TypeError: Cannot read properties of undefined (reading 'replace')
```

### 3) Make `postProcessResults()` coerce malformed values before cleanup/dedup
`formatSearchResults()` in `exa-search.ts` interpolates `r.url` and `r.snippet` as strings, so Task 3 should normalize malformed values to safe strings instead of letting the batch throw.

Replace the current `for` loop in `postProcessResults()` with this version:

```ts
for (const result of results) {
  const safeUrl = typeof (result as any).url === "string" ? (result as any).url : "";
  const safeSnippet = typeof (result as any).snippet === "string" ? (result as any).snippet : "";

  const cleaned = {
    ...result,
    url: safeUrl,
    snippet: cleanSnippet(safeSnippet),
  } as T;

  const normalized = safeUrl ? normalizeUrlForDedup(safeUrl) : null;
  if (normalized === null) {
    kept.push(cleaned);
    continue;
  }

  if (seen.has(normalized)) {
    duplicatesRemoved += 1;
    continue;
  }

  seen.add(normalized);
  kept.push(cleaned);
}
```

Keep the existing malformed-URL behavior (`normalizeUrlForDedup()` returns `null` on invalid URLs). The important change is that malformed entries no longer abort processing for later valid entries.

## Task 4: Integrate smart search into web_search output and fail-open flow
Task 4 should not emit a duplicate-removal transparency note. The spec only wants notes when search behavior changed.

### 1) Add a regression assertion in the integration test
Right before the `unchangedResult` call in `smart-search.integration.test.ts`, queue one `postProcessResults()` response that reports duplicates removed:

```ts
smartSearchState.postProcessResults.mockReturnValueOnce({
  results: [{ title: "Result", url: "https://example.com", snippet: "summary" }],
  duplicatesRemoved: 1,
});
```

Then extend the assertions for `unchangedResult` with:

```ts
expect(getText(unchangedResult)).not.toContain("Removed 1 duplicate results.");
```

### 2) Remove the duplicate-removal note from Step 3
Delete this block from the proposed `index.ts` implementation:

```ts
if (duplicatesRemoved > 0) {
  notes.push(`Removed ${duplicatesRemoved} duplicate results.`);
}
```

Do not replace it with another message. `Keyword search used.` and `Searched as: ...` are the only new transparency notes needed here.
