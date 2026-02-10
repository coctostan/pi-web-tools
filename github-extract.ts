import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  readdirSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
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

  // Check for non-code segments at position 2
  if (segments.length > 2 && NON_CODE_SEGMENTS.has(segments[2].toLowerCase())) {
    return null;
  }

  // Root URL: /owner/repo
  if (segments.length === 2) {
    return { owner, repo, refIsFullSha: false, type: "root" };
  }

  const action = segments[2];
  if (action !== "blob" && action !== "tree") return null;

  // blob/tree requires at least a ref segment
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

function execClone(
  args: string[],
  localPath: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(args[0], args.slice(1), { timeout: timeoutMs }, (err) => {
      if (err) {
        try {
          rmSync(localPath, { recursive: true, force: true });
        } catch { /* ignore */ }
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
    rmSync(localPath, { recursive: true, force: true });
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

function isBinaryFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;

  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return false;
  }
  try {
    const buf = Buffer.alloc(512);
    const bytesRead = readSync(fd, buf, 0, 512, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }

  return false;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTree(rootPath: string): string {
  const entries: string[] = [];

  function walk(dir: string, relPath: string): void {
    if (entries.length >= MAX_TREE_ENTRIES) return;

    let items: string[];
    try {
      items = readdirSync(dir).sort();
    } catch {
      return;
    }

    for (const item of items) {
      if (entries.length >= MAX_TREE_ENTRIES) return;
      if (item === ".git") continue;

      const fullPath = join(dir, item);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      const rel = relPath ? `${relPath}/${item}` : item;

      if (stat.isDirectory()) {
        if (NOISE_DIRS.has(item)) {
          entries.push(`${rel}/  [skipped]`);
          continue;
        }
        entries.push(`${rel}/`);
        walk(fullPath, rel);
      } else {
        entries.push(rel);
      }
    }
  }

  walk(rootPath, "");

  if (entries.length >= MAX_TREE_ENTRIES) {
    entries.push(`... (truncated at ${MAX_TREE_ENTRIES} entries)`);
  }

  return entries.join("\n");
}

function buildDirListing(rootPath: string, subPath: string): string {
  const targetPath = join(rootPath, subPath);
  const lines: string[] = [];

  let items: string[];
  try {
    items = readdirSync(targetPath).sort();
  } catch {
    return "(directory not readable)";
  }

  for (const item of items) {
    if (item === ".git") continue;
    const fullPath = join(targetPath, item);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        lines.push(`  ${item}/`);
      } else {
        lines.push(`  ${item}  (${formatFileSize(stat.size)})`);
      }
    } catch {
      lines.push(`  ${item}  (unreadable)`);
    }
  }

  return lines.join("\n");
}

function readReadme(localPath: string): string | null {
  const candidates = ["README.md", "readme.md", "README", "README.txt"];
  for (const name of candidates) {
    const readmePath = join(localPath, name);
    if (existsSync(readmePath)) {
      try {
        const content = readFileSync(readmePath, "utf-8");
        return content.length > README_MAX_CHARS
          ? content.slice(0, README_MAX_CHARS) + "\n\n[README truncated at 8K chars]"
          : content;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function generateContent(localPath: string, info: GitHubUrlInfo): string {
  const lines: string[] = [];
  lines.push(`Repository cloned to: ${localPath}`);
  lines.push("");

  if (info.type === "root") {
    lines.push("## Structure");
    lines.push(buildTree(localPath));
    lines.push("");

    const readme = readReadme(localPath);
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

    if (!existsSync(fullDirPath)) {
      lines.push(`Path \`${dirPath}\` not found in clone. Showing repository root instead.`);
      lines.push("");
      lines.push("## Structure");
      lines.push(buildTree(localPath));
    } else {
      lines.push(`## ${dirPath || "/"}`);
      lines.push(buildDirListing(localPath, dirPath));
    }

    lines.push("");
    lines.push("Use `read` and `bash` tools at the path above to explore further.");
    return lines.join("\n");
  }

  if (info.type === "blob") {
    const filePath = info.path || "";
    const fullFilePath = join(localPath, filePath);

    if (!existsSync(fullFilePath)) {
      lines.push(`Path \`${filePath}\` not found in clone. Showing repository root instead.`);
      lines.push("");
      lines.push("## Structure");
      lines.push(buildTree(localPath));
      lines.push("");
      lines.push("Use `read` and `bash` tools at the path above to explore further.");
      return lines.join("\n");
    }

    const stat = statSync(fullFilePath);

    if (stat.isDirectory()) {
      lines.push(`## ${filePath || "/"}`);
      lines.push(buildDirListing(localPath, filePath));
      lines.push("");
      lines.push("Use `read` and `bash` tools at the path above to explore further.");
      return lines.join("\n");
    }

    if (isBinaryFile(fullFilePath)) {
      const ext = extname(filePath).replace(".", "");
      lines.push(`## ${filePath}`);
      lines.push(`Binary file (${ext}, ${formatFileSize(stat.size)}). Use \`read\` or \`bash\` tools at the path above to inspect.`);
      return lines.join("\n");
    }

    const content = readFileSync(fullFilePath, "utf-8");
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
      const content = generateContent(result, info);
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
      const content = generateContent(result, info);
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
  try {
    result = await clonePromise;

    if (!result) {
      return null;
    }

    const content = generateContent(result, info);
    const title = info.path ? `${owner}/${repo} - ${info.path}` : `${owner}/${repo}`;
    return { url, title, content, error: null };
  } catch {
    return null;
  } finally {
    if (!result) {
      cloneCache.delete(key);
      try {
        rmSync(localPath, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

export function clearCloneCache(): void {
  for (const entry of cloneCache.values()) {
    try {
      rmSync(entry.localPath, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
  cloneCache.clear();
}
