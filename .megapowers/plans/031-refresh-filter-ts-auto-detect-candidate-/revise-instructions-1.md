## Task 1: Refresh filter model resolution contract

Task 1 claims coverage for AC 12, but the planned `filterContent` failure-path test does not assert the full return shape required by AC 12. The existing test only checks `result.filtered` and `completeFn` call count:

```ts
expect(result.filtered).toBeNull();
expect(mockComplete).not.toHaveBeenCalled();
```

Update Step 1 so the `filterContent` failure-path test asserts both `{ filtered: null, reason }` and that `completeFn` is not called. Use the real current `filterContent` signature:

```ts
export async function filterContent(
  content: string,
  prompt: string,
  registry: ModelRegistry,
  configuredModel: string | undefined,
  completeFn: CompleteFn,
  signal?: AbortSignal
): Promise<FilterResult>
```

Replace the planned/remaining failure-path assertion with this full assertion:

```ts
  it("returns fallback reason without calling completeFn when filter model resolution fails", async () => {
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: false, error: "denied" }),
    };
    const mockComplete = vi.fn();

    const result = await filterContent(
      "Some content",
      "What is this?",
      mockRegistry as any,
      "anthropic-cc/claude-haiku-4-5",
      mockComplete
    );

    expect(result).toEqual({
      filtered: null,
      reason: 'Configured filterModel "anthropic-cc/claude-haiku-4-5" not available (no model or API key)',
    });
    expect(mockComplete).not.toHaveBeenCalled();
  });
```

Because Task 1 changes the `mockModel.provider` in the `filterContent` describe block to `"anthropic-cc"`, also make sure any configured-model strings in that describe block use `"anthropic-cc/claude-haiku-4-5"` when they are meant to resolve that `mockModel`.

Also make the coverage line explicit enough for review tooling and humans. Instead of only:

```md
Covers AC 1-14.
```

use:

```md
Covers AC 1, AC 2, AC 3, AC 4, AC 5, AC 6, AC 7, AC 8, AC 9, AC 10, AC 11, AC 12, AC 13, AC 14.
```
