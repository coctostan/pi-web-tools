---
id: 15
title: GitHub clone results are returned inline without file-first
status: approved
depends_on:
  - 11
  - 13
no_test: false
files_to_modify:
  - index.ts
  - index.test.ts
files_to_create: []
---

### Task 15: GitHub clone results are returned inline without file-first [depends: 11, 13]

**AC covered:** AC 15
**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`
**Step 1 — Write failing tests**

In `index.test.ts`, ensure GitHub helpers are mocked:

```typescript
const ghState = vi.hoisted(() => ({
  parseGitHubUrl: vi.fn(),
  extractGitHub: vi.fn(),
  clearCloneCache: vi.fn(),
}));
vi.mock("./github-extract.js", () => ({
  parseGitHubUrl: ghState.parseGitHubUrl,
  extractGitHub: ghState.extractGitHub,
  clearCloneCache: ghState.clearCloneCache,
}));
```

Then add to `describe("fetch_content file-first storage", ...)`:

```typescript
it("keeps single-url GitHub clone result inline (no file-first)", async () => {
  ghState.parseGitHubUrl.mockReturnValue({ owner: "test", repo: "repo", type: "root", refIsFullSha: false });
  ghState.extractGitHub.mockResolvedValue({
    url: "https://github.com/test/repo",
    title: "test/repo",
    content: "├── src/\n└── package.json",
    error: null,
  });

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
  const result = await fetchContentTool.execute(
    "call-gh-single",
    { url: "https://github.com/test/repo" },
    undefined,
    undefined,
    ctx
  );

  expect(offloadState.offloadToFile).not.toHaveBeenCalled();
  const text = getText(result);
  expect(text).toContain("├── src/");
  expect(text).not.toContain("Full content saved to");
});

it("only successful GitHub clone URLs stay inline in mixed multi-url raw fetches", async () => {
  ghState.parseGitHubUrl.mockImplementation((url: string) =>
    url.startsWith("https://github.com/test/repo")
      ? { owner: "test", repo: "repo", type: "root", refIsFullSha: false }
      : null
  );

  ghState.extractGitHub
    .mockResolvedValueOnce({
      url: "https://github.com/test/repo",
      title: "test/repo",
      content: "├── src/\n└── package.json",
      error: null,
    })
    .mockResolvedValueOnce(null); // falls back to extractContent for second GitHub URL
  state.extractContent.mockResolvedValue({
    url: "https://github.com/test/repo/blob/main/README.md",
    title: "README",
    content: "R".repeat(1500),
    error: null,
  });

  offloadState.offloadToFile.mockReturnValue("/tmp/pi-web-fallback-gh.txt");

  const { fetchContentTool } = await getFetchContentTool();
  const ctx = { modelRegistry: { find: vi.fn(), getApiKey: vi.fn() } } as any;
  const result = await fetchContentTool.execute(
    "call-gh-mixed",
    { urls: ["https://github.com/test/repo", "https://github.com/test/repo/blob/main/README.md"] },
    undefined,
    undefined,
    ctx
  );
  expect(offloadState.offloadToFile).toHaveBeenCalledTimes(1);
  const text = getText(result);
  expect(text).toContain("test/repo");
  expect(text).toContain("├── src/");
  expect(text).toContain("/tmp/pi-web-fallback-gh.txt");
});
```

**Step 2 — Run tests, verify at least one fails pre-fix**

Run:
- `npx vitest run index.test.ts -t "keeps single-url GitHub clone result inline (no file-first)"`
- `npx vitest run index.test.ts -t "only successful GitHub clone URLs stay inline in mixed multi-url raw fetches"`

Expected: second test FAILS — `expected "spy" to be called 1 times, but got 0 times` when GitHub detection is incorrectly done at render time via `parseGitHubUrl(r.url)`.

**Step 3 — Write minimal implementation**

In `index.ts`, track successful GitHub clone extraction at fetch time:

1. In `fetch_content` execution scope, add:

```typescript
const githubCloneUrls = new Set<string>();
```

2. In `fetchOne`, use:

```typescript
const ghInfo = parseGitHubUrl(targetUrl);
if (ghInfo) {
  const ghResult = await extractGitHub(targetUrl, combinedSignal, forceClone);
  if (ghResult) {
    githubCloneUrls.add(ghResult.url);
    return ghResult;
  }
}
return extractContent(targetUrl, combinedSignal);
```

3. In both single-url and multi-url **no-prompt** branches, check:

```typescript
const isGitHubCloneResult = githubCloneUrls.has(r.url);
```

Use `isGitHubCloneResult` for inline-vs-file-first behavior (not `parseGitHubUrl(r.url)`).

**Step 4 — Run tests, verify they pass**

Run the same two commands from Step 2.

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `npx vitest run`
Expected: All tests passing.
