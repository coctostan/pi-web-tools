---
id: 2
title: Create filter module — resolveFilterModel with configured model
status: approved
depends_on:
  - 1
no_test: false
files_to_modify: []
files_to_create:
  - filter.ts
  - filter.test.ts
---

### Task 2: Create filter module — resolveFilterModel with configured model [depends: 1]

**Files:**
- Create: `filter.ts`
- Create: `filter.test.ts`

**Step 1 — Write the failing test**

Create `filter.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { resolveFilterModel } from "./filter.js";

describe("resolveFilterModel", () => {
  it("uses configured filterModel when available", async () => {
    const mockModel = { id: "claude-haiku-4-5", provider: "anthropic" };
    const mockRegistry = {
      find: vi.fn().mockReturnValue(mockModel),
      getApiKey: vi.fn().mockResolvedValue("test-key"),
    };

    const result = await resolveFilterModel(mockRegistry as any, "anthropic/claude-haiku-4-5");
    expect(result).toEqual({ model: mockModel, apiKey: "test-key" });
    expect(mockRegistry.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run filter.test.ts`

Expected: FAIL — `Error: Failed to resolve module './filter.js'` (module doesn't exist)

**Step 3 — Write minimal implementation**

Create `filter.ts`:

```typescript
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";

type MinimalModel = { id: string; provider: string };

export type FilterModelResult =
  | { model: MinimalModel; apiKey: string }
  | { model: null; reason: string };

export async function resolveFilterModel(
  registry: ModelRegistry,
  configuredModel?: string
): Promise<FilterModelResult> {
  // 1. Try configured model
  if (configuredModel) {
    const [provider, ...idParts] = configuredModel.split("/");
    const modelId = idParts.join("/");
    if (provider && modelId) {
      const model = registry.find(provider, modelId);
      if (model) {
        const apiKey = await registry.getApiKey(model);
        if (apiKey) {
          return { model, apiKey };
        }
      }
    }
    return { model: null, reason: `Configured filterModel "${configuredModel}" not available (no model or API key)` };
  }

  return { model: null, reason: "No filter model configured" };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run filter.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all passing
