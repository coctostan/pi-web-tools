import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

export const FILE_OFFLOAD_THRESHOLD = 30_000;
export const PREVIEW_SIZE = 2_000;

const trackedFiles: Set<string> = new Set();

let tempDir: string | null = null;

function ensureTempDir(): string {
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), "pi-web-"));
  }
  return tempDir;
}

function generateTempPath(): string {
  const id = randomBytes(8).toString("hex");
  return join(ensureTempDir(), `${id}.txt`);
}

/**
 * Should this content be offloaded to a file instead of returned inline?
 */
export function shouldOffload(content: string): boolean {
  return content.length > FILE_OFFLOAD_THRESHOLD;
}

/**
 * Write content to a temp file and track it for cleanup.
 * Returns the file path.
 */
export function offloadToFile(content: string): string {
  const filePath = generateTempPath();
  writeFileSync(filePath, content, { encoding: "utf-8", mode: 0o600, flag: "wx" });
  trackedFiles.add(filePath);
  return filePath;
}

/**
 * Build the replacement result text: preview + file path + instructions.
 */
export function buildOffloadResult(content: string, filePath: string): string {
  const preview = content.slice(0, PREVIEW_SIZE);
  const lines: string[] = [];
  lines.push(preview);
  if (content.length > PREVIEW_SIZE) {
    lines.push("\n...\n");
  }
  lines.push(`\nFull content saved to ${filePath} (${content.length} chars). Use bash to search/filter.`);
  return lines.join("");
}

/**
 * Remove all tracked temp files. Called on session_shutdown.
 */
export function cleanupTempFiles(): void {
  for (const filePath of trackedFiles) {
    try {
      unlinkSync(filePath);
    } catch {
      // File already deleted or inaccessible — ignore
    }
  }
  trackedFiles.clear();

  if (tempDir) {
    try {
      rmdirSync(tempDir);
    } catch {
      // Directory not empty or already removed — ignore
    }
    tempDir = null;
  }
}
