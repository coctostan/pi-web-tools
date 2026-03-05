# Plan

### Task 1: Create constants.ts with HTTP_FETCH_TIMEOUT_MS and URL_CACHE_TTL_MS [no-test]

**Justification:** Pure value exports — no observable behavior. TypeScript import catches regressions. Covers AC 7 and AC 8.

**Files:**
- Create: `constants.ts`

**Step 1 — Make the change**

Create `constants.ts` in the project root:

```ts
// constants.ts
export const HTTP_FETCH_TIMEOUT_MS = 30_000;
export const URL_CACHE_TTL_MS = 30 * 60 * 1_000; // 30 minutes in milliseconds
```

**Step 2 — Verify**

Run: `npx tsc --noEmit`
Expected: no type errors.

Also verify the values:
- `HTTP_FETCH_TIMEOUT_MS` === 30000 ✓
- `URL_CACHE_TTL_MS` === 1800000 (30 × 60 × 1000) ✓

### Task 2: Replace raw 30000 literals in extract.ts with HTTP_FETCH_TIMEOUT_MS [no-test] [depends: 1]

**Justification:** Pure refactor — identical runtime behavior, TypeScript enforces the import. No raw `30000` literal should remain in `extract.ts`. Covers AC 9.

**Files:**
- Modify: `extract.ts`

**Step 1 — Make the change**

Add the import at the top of `extract.ts` (after existing imports):

```ts
import { HTTP_FETCH_TIMEOUT_MS } from "./constants.js";
```

Replace both occurrences of `AbortSignal.timeout(30000)` in `extract.ts`. There are two: one in `extractViaHttp` and one in `extractViaJina`.

In `extractViaHttp` (around line 62–63):
```ts
// BEFORE:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
  : AbortSignal.timeout(30000);

// AFTER:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS)])
  : AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS);
```

In `extractViaJina` (around line 173–175):
```ts
// BEFORE:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
  : AbortSignal.timeout(30000);

// AFTER:
const combinedSignal = signal
  ? AbortSignal.any([signal, AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS)])
  : AbortSignal.timeout(HTTP_FETCH_TIMEOUT_MS);
```

**Step 2 — Verify**

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `grep '30000' extract.ts`
Expected: no output (no raw literal remains).

Run: `npm test`
Expected: all tests pass (behavior unchanged).

### Task 3: Add URL cache to extractContent — same URL within session returns cached result [depends: 1]

Covers AC 1 and AC 2. Adds a module-level `urlCache` Map to `extract.ts`. `extractContent` checks the cache before fetching and stores successful results (error === null) after fetching. No TTL check yet — that comes in Task 4.

**Files:**
- Modify: `extract.ts`
- Test: `extract.test.ts`

**Step 1 — Write the failing test**

Add a new `it` block inside the existing `describe("extractContent", ...)` block in `extract.test.ts`:

```ts
it("returns cached result for same URL — single network request (no TTL check yet)", async () => {
  const html = `<!DOCTYPE html><html><head><title>Cache Test</title></head><body>
<article><h1>Cache Test</h1><p>${"body text ".repeat(100)}</p></article></body></html>`;

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      "content-length": String(html.length),
    }),
    text: async () => html,
  });

  const result1 = await extractContent("https://cache-dedup.example.com/page");
  const result2 = await extractContent("https://cache-dedup.example.com/page");

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(result2.url).toBe(result1.url);
  expect(result2.title).toBe(result1.title);
  expect(result2.content).toBe(result1.content);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`
Expected: FAIL — `AssertionError: expected spy to have been called 1 time, but was called 2 times`

**Step 3 — Write minimal implementation**

In `extract.ts`, add the following after the existing imports and constants (e.g., after `const NON_RECOVERABLE_ERRORS` and before `const MAX_SIZE`):

```ts
// ---------------------------------------------------------------------------
// URL cache (session-scoped, cleared via clearUrlCache on session start)
// ---------------------------------------------------------------------------

interface UrlCacheEntry {
  result: ExtractedContent;
  fetchedAt: number;
}

const urlCache = new Map<string, UrlCacheEntry>();
```

Modify `extractContent` to check the cache after URL validation and store successful results before returning. Replace the existing `extractContent` function body:

```ts
export async function extractContent(
  url: string,
  signal?: AbortSignal
): Promise<ExtractedContent> {
  // Check abort first
  if (signal?.aborted) {
    return makeErrorResult(url, "Aborted");
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return makeErrorResult(url, "Invalid URL");
  }

  // Check cache (no TTL check — Task 3; TTL added in Task 4)
  const cached = urlCache.get(url);
  if (cached) return cached.result;

  let httpResult: ExtractedContent;
  let httpError: string | null = null;

  try {
    httpResult = await extractViaHttp(url, signal);
    // If no error, cache and return
    if (!httpResult.error) {
      urlCache.set(url, { result: httpResult, fetchedAt: Date.now() });
      return httpResult;
    }
    // If non-recoverable, return directly (don't cache errors)
    if (NON_RECOVERABLE_ERRORS.includes(httpResult.error)) return httpResult;
    // Recoverable error — try Jina
    httpError = httpResult.error;
  } catch (err: unknown) {
    httpError = err instanceof Error ? err.message : String(err);
  }

  // Try Jina fallback
  const jinaResult = await extractViaJina(url, signal);
  if (jinaResult) {
    urlCache.set(url, { result: jinaResult, fetchedAt: Date.now() });
    return jinaResult;
  }

  // Jina also failed — return original error with helpful message
  const errorMsg = httpError
    ? `${httpError}. Jina Reader fallback also failed.`
    : "Failed to extract content";
  return makeErrorResult(url, errorMsg);
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass

### Task 4: Add TTL expiry to URL cache — stale entries cause fresh network request [depends: 3]

Covers AC 3 and AC 10. Imports `URL_CACHE_TTL_MS` from `constants.ts` and adds a TTL check to the cache lookup. A cache entry older than `URL_CACHE_TTL_MS` (30 minutes) is treated as a miss.

**Files:**
- Modify: `extract.ts`
- Test: `extract.test.ts`

**Step 1 — Write the failing test**

Add a new `it` block inside the existing `describe("extractContent", ...)` block in `extract.test.ts`. Also update the `afterEach` at the top of the describe block to add `vi.restoreAllMocks()`:

```ts
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks(); // restore Date.now spy
});
```

Then add the test:

```ts
it("treats cached entry as stale after URL_CACHE_TTL_MS has elapsed", async () => {
  const html = `<!DOCTYPE html><html><head><title>TTL Test</title></head><body>
<article><h1>TTL Test</h1><p>${"body ".repeat(100)}</p></article></body></html>`;

  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      "content-length": String(html.length),
    }),
    text: async () => html,
  });

  const url = "https://ttl-test.example.com/page";

  // First fetch — caches result at now=0
  now = 0;
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // Advance time past TTL (30 min + 1 ms = 1_800_001 ms)
  now = 1_800_001;
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`
Expected: FAIL — `AssertionError: expected spy to have been called 2 times, but was called 1 time`

(With Task 3's implementation, the cache has no TTL check — the second call at `now=1_800_001` still hits the cache, so `mockFetch` is called only once.)

**Step 3 — Write minimal implementation**

1. Add `URL_CACHE_TTL_MS` to the import at the top of `extract.ts`:

```ts
import { HTTP_FETCH_TIMEOUT_MS, URL_CACHE_TTL_MS } from "./constants.js";
```

2. In `extractContent`, replace the cache lookup with a TTL-aware check:

```ts
// BEFORE (Task 3):
const cached = urlCache.get(url);
if (cached) return cached.result;

// AFTER (Task 4):
const cached = urlCache.get(url);
if (cached && Date.now() - cached.fetchedAt < URL_CACHE_TTL_MS) return cached.result;
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass

### Task 5: Export clearUrlCache() from extract.ts and verify it clears the cache [depends: 3]

Covers AC 4 and AC 5. Exports `clearUrlCache()` from `extract.ts`. After calling it, the next `extractContent()` call for any previously-cached URL makes a fresh network request.

**Files:**
- Modify: `extract.ts`
- Test: `extract.test.ts`

**Step 1 — Write the failing test**

Update the import at the top of `extract.test.ts` to include `clearUrlCache`:

```ts
import { extractContent, extractHeadingTitle, fetchAllContent, clearUrlCache } from "./extract.js";
```

Add a new `it` block inside the existing `describe("extractContent", ...)` block:

```ts
it("clearUrlCache() causes next call to make a fresh network request", async () => {
  const html = `<!DOCTYPE html><html><head><title>Clear Test</title></head><body>
<article><h1>Clear Test</h1><p>${"body ".repeat(100)}</p></article></body></html>`;

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      "content-length": String(html.length),
    }),
    text: async () => html,
  });

  const url = "https://clear-cache.example.com/page";

  // First fetch — caches result
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // Clear the cache
  clearUrlCache();

  // Second fetch — cache miss, must re-fetch
  await extractContent(url);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run extract.test.ts`
Expected: FAIL — module import error for missing named export `clearUrlCache` from `"./extract.js"` (e.g., "does not provide an export named 'clearUrlCache'" / "No matching export")

(Vitest fails at module-load/import time because `clearUrlCache` is not yet exported from `extract.ts`; this is not a `tsc` diagnostic.)

**Step 3 — Write minimal implementation**

Add the following export to `extract.ts`, immediately after the `urlCache` Map declaration:

```ts
export function clearUrlCache(): void {
  urlCache.clear();
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run extract.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass

### Task 6: Call clearUrlCache() in onSessionStart in index.ts [depends: 5]

Covers AC 6. Each new session begins with an empty URL cache. `clearUrlCache` is added to the `handleSessionStart` function in `index.ts` alongside the existing `clearCloneCache()` and `cleanupTempFiles()` calls.

**Files:**
- Modify: `index.ts`
- Test: `index.test.ts`

**Step 1 — Write the failing test**

1. In `index.test.ts`, update the hoisted `state` object to include `clearUrlCache`:

```ts
const state = vi.hoisted(() => ({
  extractContent: vi.fn(),
  filterContent: vi.fn(),
  clearUrlCache: vi.fn(),  // ← add this
}));
```

2. Update the `vi.mock("./extract.js", ...)` factory to include `clearUrlCache`:

```ts
vi.mock("./extract.js", () => ({
  extractContent: state.extractContent,
  fetchAllContent: vi.fn(),
  clearUrlCache: state.clearUrlCache,  // ← add this
}));
```

3. Add a helper function and a new describe block (add after the existing helpers like `getToolResultHandler`):

```ts
async function getSessionHandlers() {
  vi.resetModules();
  const handlers = new Map<string, any>();
  const pi = {
    on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
    registerTool: vi.fn(),
    appendEntry: vi.fn(),
  };
  const { default: registerExtension } = await import("./index.js");
  registerExtension(pi as any);
  return handlers;
}

describe("session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls clearUrlCache on session_start", async () => {
    const handlers = await getSessionHandlers();
    const handler = handlers.get("session_start");
    expect(handler).toBeDefined();
    const ctx = {
      sessionManager: {
        getEntries: () => [],
      },
    };

    await handler({}, ctx as any);
    expect(state.clearUrlCache).toHaveBeenCalled();
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run index.test.ts`
Expected: FAIL - `AssertionError: expected "spy" to have been called`

(With a valid `ctx.sessionManager.getEntries()` stub, the pre-implementation failure is the assertion because `handleSessionStart` does not yet call `clearUrlCache`.)

**Step 3 — Write minimal implementation**

1. In `index.ts`, add `clearUrlCache` to the import from `./extract.js`:

```ts
import { extractContent, fetchAllContent, clearUrlCache } from "./extract.js";
```

2. In the `handleSessionStart` function, add `clearUrlCache()` alongside the other cache-clearing calls:

```ts
function handleSessionStart(ctx: ExtensionContext): void {
  abortAllPending();
  clearCloneCache();
  clearUrlCache();       // ← add this line
  cleanupTempFiles();
  sessionActive = true;
  restoreFromSession(ctx);
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all tests pass

### Task 7: Remove sessionActive dead variable from index.ts [no-test] [depends: 6]

**Justification:** Dead code removal — `sessionActive` is set but never read, purely a no-op. TypeScript would flag any remaining reference if the variable name were accidentally kept. Covers AC 11.

**Files:**
- Modify: `index.ts`

**Step 1 — Make the change**

Remove the following three lines from `index.ts`:

Line ~35 (module-level declaration):
```ts
let sessionActive = false;  // ← DELETE this line
```

In `handleSessionStart` (around line 52):
```ts
sessionActive = true;  // ← DELETE this line
```

In `handleSessionShutdown` (around line 57):
```ts
sessionActive = false;  // ← DELETE this line
```

After removal, `handleSessionStart` should look like:
```ts
function handleSessionStart(ctx: ExtensionContext): void {
  abortAllPending();
  clearCloneCache();
  clearUrlCache();
  cleanupTempFiles();
  restoreFromSession(ctx);
}
```

And `handleSessionShutdown` should look like:
```ts
function handleSessionShutdown(): void {
  abortAllPending();
  clearCloneCache();
  clearResults();
  resetConfigCache();
  cleanupTempFiles();
}
```

**Step 2 — Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `grep 'sessionActive' index.ts`
Expected: no output (no references remain).

Run: `npm test`
Expected: all tests pass.

### Task 8: Delete todo.md from the repository root [no-test]

**Justification:** Documentation/housekeeping — stale file with one-time setup tasks. No code references `todo.md`. Covers AC 12.

**Files:**
- Delete: `todo.md`

**Step 1 — Make the change**

```bash
rm todo.md
```

**Step 2 — Verify**

Run: `ls todo.md`
Expected: `ls: todo.md: No such file or directory`

Run: `npm test`
Expected: all tests pass (no test references `todo.md`).

### Task 9: Convert all sync fs operations in github-extract.ts to fs.promises

Covers AC 13 and AC 14. Converts every synchronous `fs` call (`existsSync`, `readFileSync`, `statSync`, `readdirSync`, `rmSync`, `openSync`, `readSync`, `closeSync`) to their `fs.promises` equivalents. All affected functions (`isBinaryFile`, `buildTree`, `buildDirListing`, `readReadme`, `generateContent`, `execClone`, `cloneRepo`, `clearCloneCache`) become async where needed. The `github-extract.clone.test.ts` mock is updated from `node:fs` to `node:fs/promises`.

**Files:**
- Modify: `github-extract.ts`
- Test: `github-extract.clone.test.ts`

**Step 1 — Write the failing test**

Update `github-extract.clone.test.ts` completely. Replace the `state` hoisted object and `vi.mock("node:fs", ...)` block with async equivalents:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "oversize" as "oversize" | "clone-fail" | "clone-throw" | "content-throw",
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./config.js", () => ({
  getConfig: () => ({
    exaApiKey: null,
    github: {
      maxRepoSizeMB: 1,
      cloneTimeoutSeconds: 1,
      clonePath: "/tmp/pi-github-repos-test",
    },
  }),
}));

vi.mock("node:fs/promises", async () => {
  return {
    rm: state.rm,
    access: vi.fn(async () => {
      if (state.mode === "content-throw") {
        // File exists in content-throw mode
        return;
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }),
    stat: vi.fn(async () => {
      if (state.mode === "content-throw") {
        throw new Error("stat exploded");
      }
      return { isDirectory: () => false, size: 0 };
    }),
    readdir: vi.fn(async () => []),
    readFile: vi.fn(async () => ""),
    open: vi.fn(async () => ({
      read: vi.fn(async () => ({ bytesRead: 0, buffer: Buffer.alloc(0) })),
      close: vi.fn(async () => {}),
    })),
  };
});

vi.mock("node:child_process", () => ({
  execFile: (cmd: string, args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
    const joined = [cmd, ...args].join(" ");

    if (joined.includes("gh api") && joined.includes("--jq") && joined.includes(".size")) {
      if (state.mode === "oversize") {
        cb(null, "999999", "");
      } else {
        cb(null, "10", "");
      }
      return { on() {}, kill() {} };
    }

    if (joined.startsWith("gh repo clone") || joined.startsWith("git clone")) {
      if (state.mode === "clone-throw") {
        throw new Error("clone exploded");
      }
      if (state.mode === "clone-fail") {
        cb(new Error("clone failed"), "", "");
      } else {
        cb(null, "", "");
      }
      return { on() {}, kill() {} };
    }

    cb(new Error(`unexpected command: ${joined}`), "", "");
    return { on() {}, kill() {} };
  },
}));

describe("extractGitHub clone behavior", () => {
  beforeEach(() => {
    state.mode = "oversize";
    state.rm.mockReset();
    vi.resetModules();
  });

  it("skips cloning oversized repos and returns a helpful message", async () => {
    const { extractGitHub } = await import("./github-extract.js");

    const result = await extractGitHub("https://github.com/owner/repo");
    expect(result).not.toBeNull();
    expect(result!.content).toMatch(/Skipping clone/i);
    expect(result!.content).toMatch(/forceClone: true/i);
  });

  it("cleans up local clone path when clone fails", async () => {
    state.mode = "clone-fail";

    const { extractGitHub, clearCloneCache } = await import("./github-extract.js");

    const result = await extractGitHub("https://github.com/owner/repo");
    expect(result).toBeNull();

    const expectedPath = "/tmp/pi-github-repos-test/owner/repo";
    const expectedOptions = { recursive: true, force: true };
    const matchingCalls = state.rm.mock.calls.filter(
      ([path, options]: [string, object]) =>
        path === expectedPath && JSON.stringify(options) === JSON.stringify(expectedOptions)
    );

    expect(matchingCalls.length).toBeGreaterThan(1);

    clearCloneCache();
  });

  it("returns null and cleans up when clone command throws unexpectedly", async () => {
    state.mode = "clone-throw";

    const { extractGitHub, clearCloneCache } = await import("./github-extract.js");

    await expect(extractGitHub("https://github.com/owner/repo")).resolves.toBeNull();

    const expectedPath = "/tmp/pi-github-repos-test/owner/repo";
    const expectedOptions = { recursive: true, force: true };
    const matchingCalls = state.rm.mock.calls.filter(
      ([path, options]: [string, object]) =>
        path === expectedPath && JSON.stringify(options) === JSON.stringify(expectedOptions)
    );

    expect(matchingCalls.length).toBeGreaterThan(1);

    clearCloneCache();
  });

  it("cleans up when content generation fails after a successful clone", async () => {
    state.mode = "content-throw";

    const { extractGitHub, clearCloneCache } = await import("./github-extract.js");

    await expect(extractGitHub("https://github.com/owner/repo/blob/main/README.md")).resolves.toBeNull();

    const expectedPath = "/tmp/pi-github-repos-test/owner/repo@main";
    const expectedOptions = { recursive: true, force: true };
    const matchingCalls = state.rm.mock.calls.filter(
      ([path, options]: [string, object]) =>
        path === expectedPath && JSON.stringify(options) === JSON.stringify(expectedOptions)
    );

    expect(matchingCalls.length).toBeGreaterThan(1);

    clearCloneCache();
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run github-extract.clone.test.ts`
Expected: FAIL — `AssertionError: expected 0 to be greater than 1`

(The `node:fs/promises` mock is now in place but the implementation still uses synchronous `rmSync` from `node:fs`, so `state.rm` is never called. The "cleans up local clone path when clone fails" test fails because `state.rm.mock.calls` is empty.)

**Step 3 — Write minimal implementation**

Replace the entire content of `github-extract.ts` with the async version below.

Key changes:
1. Remove all `node:fs` sync imports; add named imports from `node:fs/promises`
2. `isBinaryFile` → async using `fs.promises.open`/`fileHandle.read`
3. `buildTree` → async using `readdir` + `stat`
4. `buildDirListing` → async using `readdir` + `stat`
5. `readReadme` → async using `access` + `readFile`
6. `generateContent` → async; uses `access` for existence checks, `stat` without try-catch in blob path (preserves throw-on-error behavior for content-throw test)
7. `execClone` → async; cleanup via `await rm(...)` after Promise resolves
8. `cloneRepo` → async cleanup via `await rm(...)`
9. `clearCloneCache` → fire-and-forget `rm(...).catch(() => {})` (stays sync)

```ts
import { rm, access, stat, readdir, readFile, open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, extname } from "node:path";
import type { ExtractedContent } from "./storage.js";
import { getConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg", ".tiff", ".tif",
  ".mp3", ".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".wav", ".ogg", ".webm", ".flac", ".aac",
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar", ".zst",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".lib",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".sqlite", ".db", ".sqlite3",
  ".pyc", ".pyo", ".class", ".jar", ".war",
  ".iso", ".img", ".dmg",
]);

const NOISE_DIRS = new Set([
  "node_modules", "vendor", ".next", "dist", "build", "__pycache__",
  ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache",
  "target", ".gradle", ".idea", ".vscode",
]);

const NON_CODE_SEGMENTS = new Set([
  "issues", "pull", "pulls", "discussions", "releases", "wiki",
  "actions", "settings", "security", "projects",
  "compare", "commits", "tags", "branches", "stargazers",
  "watchers", "network", "forks",
]);

const MAX_INLINE_FILE_CHARS = 100_000;
const MAX_TREE_ENTRIES = 200;
const README_MAX_CHARS = 8192;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubUrlInfo {
  owner: string;
  repo: string;
  ref?: string;
  refIsFullSha: boolean;
  path?: string;
  type: "root" | "blob" | "tree";
}

interface CachedClone {
  localPath: string;
  clonePromise: Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Clone cache
// ---------------------------------------------------------------------------

const cloneCache = new Map<string, CachedClone>();

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

export function parseGitHubUrl(url: string): GitHubUrlInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== "github.com") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");

  if (segments.length > 2 && NON_CODE_SEGMENTS.has(segments[2].toLowerCase())) {
    return null;
  }

  if (segments.length === 2) {
    return { owner, repo, refIsFullSha: false, type: "root" };
  }

  const action = segments[2];
  if (action !== "blob" && action !== "tree") return null;

  if (segments.length < 4) {
    return null;
  }

  const ref = segments[3];
  const refIsFullSha = /^[0-9a-f]{40}$/.test(ref);
  const pathParts = segments.slice(4);
  const path = pathParts.length > 0 ? pathParts.join("/") : "";

  return {
    owner,
    repo,
    ref,
    refIsFullSha,
    path,
    type: action as "blob" | "tree",
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cacheKey(owner: string, repo: string, ref?: string): string {
  return ref ? `${owner}/${repo}@${ref}` : `${owner}/${repo}`;
}

function cloneDir(owner: string, repo: string, ref?: string): string {
  const config = getConfig();
  const dirName = ref ? `${repo}@${ref}` : repo;
  return join(config.github.clonePath, owner, dirName);
}

function runCommand(
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(args[0], args.slice(1), { timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });

    if (signal) {
      const onAbort = () => child.kill();
      signal.addEventListener("abort", onAbort, { once: true });
      child.on("exit", () => signal.removeEventListener("abort", onAbort));
    }
  });
}

async function checkRepoSize(owner: string, repo: string): Promise<number | null> {
  try {
    const stdout = await runCommand(
      ["gh", "api", `repos/${owner}/${repo}`, "--jq", ".size"],
      10_000,
    );
    const kb = parseInt(stdout, 10);
    return Number.isNaN(kb) ? null : kb;
  } catch {
    return null;
  }
}

async function execClone(
  args: string[],
  localPath: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await new Promise<string | null>((resolve) => {
    const child = execFile(args[0], args.slice(1), { timeout: timeoutMs }, (err) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(localPath);
    });

    if (signal) {
      const onAbort = () => child.kill();
      signal.addEventListener("abort", onAbort, { once: true });
      child.on("exit", () => signal.removeEventListener("abort", onAbort));
    }
  });

  if (result === null) {
    try {
      await rm(localPath, { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  return result;
}

async function cloneRepo(
  owner: string,
  repo: string,
  ref: string | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const config = getConfig();
  const localPath = cloneDir(owner, repo, ref);
  const timeoutMs = config.github.cloneTimeoutSeconds * 1000;

  // Clean up any previous clone at this path
  try {
    await rm(localPath, { recursive: true, force: true });
  } catch { /* ignore */ }

  // Try gh first
  const ghArgs = ["gh", "repo", "clone", `${owner}/${repo}`, localPath, "--", "--depth", "1", "--single-branch"];
  if (ref) ghArgs.push("--branch", ref);

  const ghResult = await execClone(ghArgs, localPath, timeoutMs, signal);
  if (ghResult) return ghResult;

  // Fallback to git clone
  const gitUrl = `https://github.com/${owner}/${repo}.git`;
  const gitArgs = ["git", "clone", "--depth", "1", "--single-branch"];
  if (ref) gitArgs.push("--branch", ref);
  gitArgs.push(gitUrl, localPath);

  return execClone(gitArgs, localPath, timeoutMs, signal);
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;

  let fileHandle: FileHandle | null = null;
  try {
    fileHandle = await open(filePath, "r");
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fileHandle.read(buf, 0, 512, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
  } catch {
    return false;
  } finally {
    await fileHandle?.close();
  }

  return false;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function buildTree(rootPath: string): Promise<string> {
  const entries: string[] = [];

  async function walk(dir: string, relPath: string): Promise<void> {
    if (entries.length >= MAX_TREE_ENTRIES) return;

    let items: string[];
    try {
      items = (await readdir(dir)).sort();
    } catch {
      return;
    }

    for (const item of items) {
      if (entries.length >= MAX_TREE_ENTRIES) return;
      if (item === ".git") continue;

      const fullPath = join(dir, item);
      let st;
      try {
        st = await stat(fullPath);
      } catch {
        continue;
      }

      const rel = relPath ? `${relPath}/${item}` : item;

      if (st.isDirectory()) {
        if (NOISE_DIRS.has(item)) {
          entries.push(`${rel}/  [skipped]`);
          continue;
        }
        entries.push(`${rel}/`);
        await walk(fullPath, rel);
      } else {
        entries.push(rel);
      }
    }
  }

  await walk(rootPath, "");

  if (entries.length >= MAX_TREE_ENTRIES) {
    entries.push(`... (truncated at ${MAX_TREE_ENTRIES} entries)`);
  }

  return entries.join("\n");
}

async function buildDirListing(rootPath: string, subPath: string): Promise<string> {
  const targetPath = join(rootPath, subPath);
  const lines: string[] = [];

  let items: string[];
  try {
    items = (await readdir(targetPath)).sort();
  } catch {
    return "(directory not readable)";
  }

  for (const item of items) {
    if (item === ".git") continue;
    const fullPath = join(targetPath, item);
    try {
      const st = await stat(fullPath);
      if (st.isDirectory()) {
        lines.push(`  ${item}/`);
      } else {
        lines.push(`  ${item}  (${formatFileSize(st.size)})`);
      }
    } catch {
      lines.push(`  ${item}  (unreadable)`);
    }
  }

  return lines.join("\n");
}

async function readReadme(localPath: string): Promise<string | null> {
  const candidates = ["README.md", "readme.md", "README", "README.txt"];
  for (const name of candidates) {
    const readmePath = join(localPath, name);
    try {
      await access(readmePath);
      const content = await readFile(readmePath, "utf-8");
      return content.length > README_MAX_CHARS
        ? content.slice(0, README_MAX_CHARS) + "\n\n[README truncated at 8K chars]"
        : content;
    } catch {
      continue;
    }
  }
  return null;
}

async function generateContent(localPath: string, info: GitHubUrlInfo): Promise<string> {
  const lines: string[] = [];
  lines.push(`Repository cloned to: ${localPath}`);
  lines.push("");

  if (info.type === "root") {
    lines.push("## Structure");
    lines.push(await buildTree(localPath));
    lines.push("");

    const readme = await readReadme(localPath);
    if (readme) {
      lines.push("## README.md");
      lines.push(readme);
      lines.push("");
    }

    lines.push("Use `read` and `bash` tools at the path above to explore further.");
    return lines.join("\n");
  }

  if (info.type === "tree") {
    const dirPath = info.path || "";
    const fullDirPath = join(localPath, dirPath);

    let dirExists = false;
    try {
      await access(fullDirPath);
      dirExists = true;
    } catch { /* path not found */ }

    if (!dirExists) {
      lines.push(`Path \`${dirPath}\` not found in clone. Showing repository root instead.`);
      lines.push("");
      lines.push("## Structure");
      lines.push(await buildTree(localPath));
    } else {
      lines.push(`## ${dirPath || "/"}`);
      lines.push(await buildDirListing(localPath, dirPath));
    }

    lines.push("");
    lines.push("Use `read` and `bash` tools at the path above to explore further.");
    return lines.join("\n");
  }

  if (info.type === "blob") {
    const filePath = info.path || "";
    const fullFilePath = join(localPath, filePath);

    let fileExists = false;
    try {
      await access(fullFilePath);
      fileExists = true;
    } catch { /* path not found */ }

    if (!fileExists) {
      lines.push(`Path \`${filePath}\` not found in clone. Showing repository root instead.`);
      lines.push("");
      lines.push("## Structure");
      lines.push(await buildTree(localPath));
      lines.push("");
      lines.push("Use `read` and `bash` tools at the path above to explore further.");
      return lines.join("\n");
    }

    // No try-catch — propagates errors (e.g. stat throwing in tests)
    const fileStat = await stat(fullFilePath);

    if (fileStat.isDirectory()) {
      lines.push(`## ${filePath || "/"}`);
      lines.push(await buildDirListing(localPath, filePath));
      lines.push("");
      lines.push("Use `read` and `bash` tools at the path above to explore further.");
      return lines.join("\n");
    }

    if (await isBinaryFile(fullFilePath)) {
      const ext = extname(filePath).replace(".", "");
      lines.push(`## ${filePath}`);
      lines.push(`Binary file (${ext}, ${formatFileSize(fileStat.size)}). Use \`read\` or \`bash\` tools at the path above to inspect.`);
      return lines.join("\n");
    }

    const content = await readFile(fullFilePath, "utf-8");
    lines.push(`## ${filePath}`);

    if (content.length > MAX_INLINE_FILE_CHARS) {
      lines.push(content.slice(0, MAX_INLINE_FILE_CHARS));
      lines.push("");
      lines.push(`[File truncated at 100K chars. Full file: ${fullFilePath}]`);
    } else {
      lines.push(content);
    }

    lines.push("");
    lines.push("Use `read` and `bash` tools at the path above to explore further.");
    return lines.join("\n");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function extractGitHub(
  url: string,
  signal?: AbortSignal,
  forceClone?: boolean,
): Promise<ExtractedContent | null> {
  const info = parseGitHubUrl(url);
  if (!info) return null;

  const config = getConfig();
  const { owner, repo } = info;
  const key = cacheKey(owner, repo, info.ref);

  // Check clone cache
  const cached = cloneCache.get(key);
  if (cached) {
    const result = await cached.clonePromise;
    if (result) {
      const content = await generateContent(result, info);
      const title = info.path ? `${owner}/${repo} - ${info.path}` : `${owner}/${repo}`;
      return { url, title, content, error: null };
    }
    return null;
  }

  // Full SHA: skip, let normal fetch handle it
  if (info.refIsFullSha) return null;

  // Size check (unless forced)
  if (!forceClone) {
    const sizeKB = await checkRepoSize(owner, repo);
    if (sizeKB !== null) {
      const sizeMB = sizeKB / 1024;
      if (sizeMB > config.github.maxRepoSizeMB) {
        const title = `${owner}/${repo}`;
        const content =
          `Repository ${owner}/${repo} is ${Math.round(sizeMB)}MB (threshold: ${config.github.maxRepoSizeMB}MB). ` +
          `Skipping clone. Ask the user if they'd like to clone the full repo — ` +
          `if yes, call fetch_content again with the same URL and add forceClone: true to the params.`;
        return { url, title, content, error: null };
      }
    }
  }

  // Re-check cache after async size check
  const cachedAfterCheck = cloneCache.get(key);
  if (cachedAfterCheck) {
    const result = await cachedAfterCheck.clonePromise;
    if (result) {
      const content = await generateContent(result, info);
      const title = info.path ? `${owner}/${repo} - ${info.path}` : `${owner}/${repo}`;
      return { url, title, content, error: null };
    }
    return null;
  }

  // Clone
  const localPath = cloneDir(owner, repo, info.ref);
  const clonePromise = cloneRepo(owner, repo, info.ref, signal);
  cloneCache.set(key, { localPath, clonePromise });

  let result: string | null = null;
  let keepClone = false;
  try {
    result = await clonePromise;

    if (!result) {
      return null;
    }

    const content = await generateContent(result, info);
    const title = info.path ? `${owner}/${repo} - ${info.path}` : `${owner}/${repo}`;
    keepClone = true;
    return { url, title, content, error: null };
  } catch {
    return null;
  } finally {
    if (!keepClone) {
      cloneCache.delete(key);
      try {
        await rm(localPath, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

export function clearCloneCache(): void {
  for (const entry of cloneCache.values()) {
    rm(entry.localPath, { recursive: true, force: true }).catch(() => {});
  }
  cloneCache.clear();
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run github-extract.clone.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`
Expected: all passing

Verify no sync fs methods remain:
```bash
grep -E 'existsSync|readFileSync|statSync|readdirSync|rmSync|openSync|readSync|closeSync' github-extract.ts
```
Expected: no output
