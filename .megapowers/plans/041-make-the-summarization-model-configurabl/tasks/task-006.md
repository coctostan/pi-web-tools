---
id: 6
title: Reject malformed configured model before registry lookup
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - filter.ts
  - filter.test.ts
files_to_create: []
---

Covers AC 7 and AC 12.

**Files:**
- Modify: `filter.test.ts`
- Modify: `filter.ts`

**Step 1 — Write the failing test**
In `filter.test.ts`, inside `describe("resolveFilterModel", ...)`, add this test after `returns no-model when getApiKeyAndHeaders returns ok:false`:

```ts
  it("returns malformed-config failure without registry lookup for invalid configured filterModel", async () => {
    const mockRegistry = {
      find: vi.fn(),
      getApiKeyAndHeaders: vi.fn(),
    };

    const result = await resolveFilterModel(mockRegistry as any, "provider/");

    expect(result).toEqual({
      model: null,
      reason: 'Configured filterModel "provider/" is malformed (expected provider/model-id)',
    });
    expect(mockRegistry.find).not.toHaveBeenCalled();
    expect(mockRegistry.getApiKeyAndHeaders).not.toHaveBeenCalled();
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run filter.test.ts -t "malformed-config failure"`
Expected: FAIL — `AssertionError: expected { model: null, …(1) } to deeply equal { model: null, …(1) }` with diff showing received reason `Configured filterModel "provider/" not available (no model or API key)`.

**Step 3 — Write minimal implementation**
In `filter.ts`, inside `resolveFilterModel`, replace the configured-model parsing branch:

```ts
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (provider && modelId) {
      const model = registry.find(provider, modelId);
      if (model) {
        const auth = await tryResolve(registry, model);
        if (auth) {
          return { model, apiKey: auth.apiKey, headers: auth.headers };
        }
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }
```

with:

```ts
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (!provider || !modelId) {
      return { model: null, reason: `Configured filterModel "${configuredModel}" is malformed (expected provider/model-id)` };
    }

    const model = registry.find(provider, modelId);
    if (model) {
      const auth = await tryResolve(registry, model);
      if (auth) {
        return { model, apiKey: auth.apiKey, headers: auth.headers };
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run filter.test.ts -t "malformed-config failure"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
