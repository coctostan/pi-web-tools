---
id: 1
title: Add filterModel field to config
status: approved
depends_on: []
no_test: false
files_to_modify:
  - config.ts
  - config.test.ts
files_to_create: []
---

### Task 1: Add filterModel field to config

**Files:**
- Modify: `config.ts`
- Test: `config.test.ts`

**Step 1 — Write the failing test**

Add to `config.test.ts`:

```typescript
it("reads filterModel from config when present", () => {
  writeFileSync(configPath, JSON.stringify({ filterModel: "anthropic/claude-haiku-4-5" }));
  resetConfigCache();
  const config = getConfig();
  expect(config.filterModel).toBe("anthropic/claude-haiku-4-5");
});

it("defaults filterModel to undefined when missing", () => {
  writeFileSync(configPath, JSON.stringify({}));
  resetConfigCache();
  const config = getConfig();
  expect(config.filterModel).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run config.test.ts`

Expected: FAIL — `Property 'filterModel' does not exist on type 'WebToolsConfig'`

**Step 3 — Write minimal implementation**

In `config.ts`, add `filterModel` to the `WebToolsConfig` interface and `buildConfig()`:

1. Add to `WebToolsConfig` interface:
```typescript
export interface WebToolsConfig {
  exaApiKey: string | null;
  filterModel?: string;
  github: GitHubConfig;
  tools: ToolToggles;
}
```

2. Add to `DEFAULT_CONFIG`:
```typescript
const DEFAULT_CONFIG: WebToolsConfig = {
  exaApiKey: null,
  filterModel: undefined,
  // ... rest unchanged
};
```

3. Add to `buildConfig()` before the `return` statement:
```typescript
const filterModel = typeof file["filterModel"] === "string" && file["filterModel"].includes("/")
  ? file["filterModel"]
  : undefined;
```

4. Update the return to include `filterModel`:
```typescript
return { exaApiKey, filterModel, github, tools };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run config.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npx vitest run`

Expected: all 112 tests passing
