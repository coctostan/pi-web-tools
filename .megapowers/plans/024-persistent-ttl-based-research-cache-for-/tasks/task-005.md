---
id: 5
title: "config.ts: add cacheTTLMinutes field with 1440 default"
status: approved
depends_on: []
no_test: false
files_to_modify:
  - config.ts
  - config.test.ts
files_to_create: []
---

### Task 5: config.ts: add cacheTTLMinutes field with 1440 default

**Files:**
- Modify: `config.ts`
- Modify: `config.test.ts`

**Step 1 — Write the failing test**

Add to `config.test.ts` inside the `describe("config", ...)` block:

```typescript
  it("defaults cacheTTLMinutes to 1440 when missing", () => {
    writeFileSync(configPath, JSON.stringify({}));
    resetConfigCache();
    const config = getConfig();
    expect(config.cacheTTLMinutes).toBe(1440);
  });

  it("reads cacheTTLMinutes from config file", () => {
    writeFileSync(configPath, JSON.stringify({ cacheTTLMinutes: 60 }));
    resetConfigCache();
    const config = getConfig();
    expect(config.cacheTTLMinutes).toBe(60);
  });

  it("ignores non-number cacheTTLMinutes", () => {
    writeFileSync(configPath, JSON.stringify({ cacheTTLMinutes: "abc" }));
    resetConfigCache();
    const config = getConfig();
    expect(config.cacheTTLMinutes).toBe(1440);
  });
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run config.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // expected: 1440, received: undefined`

**Step 3 — Write minimal implementation**

In `config.ts`:

1. Add `cacheTTLMinutes: number;` to the `WebToolsConfig` interface (after the `tools` field):

```typescript
export interface WebToolsConfig {
  exaApiKey: string | null;
  filterModel?: string;
  github: GitHubConfig;
  tools: ToolToggles;
  cacheTTLMinutes: number;
}
```

2. Add `cacheTTLMinutes: 1440` to `DEFAULT_CONFIG`:

```typescript
const DEFAULT_CONFIG: WebToolsConfig = {
  exaApiKey: null,
  filterModel: undefined,
  github: {
    maxRepoSizeMB: 350,
    cloneTimeoutSeconds: 30,
    clonePath: "/tmp/pi-github-repos",
  },
  tools: {
    web_search: true,
    code_search: true,
    fetch_content: true,
    get_search_content: true,
  },
  cacheTTLMinutes: 1440,
};
```

3. In `buildConfig()`, before the return statement, add:

```typescript
  const cacheTTLMinutes = typeof file["cacheTTLMinutes"] === "number" && Number.isFinite(file["cacheTTLMinutes"] as number)
    ? file["cacheTTLMinutes"] as number
    : DEFAULT_CONFIG.cacheTTLMinutes;
```

4. Update the return in `buildConfig()`:

```typescript
  return { exaApiKey, filterModel, github, tools, cacheTTLMinutes };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run config.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing
