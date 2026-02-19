import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const FILE_OFFLOAD_THRESHOLD = 30_000;
export const PREVIEW_SIZE = 2_000;

const trackedFiles: Set<string> = new Set();

let idCounter = 0;

function generateTempPath(): string {
  const id = Date.now().toString(36) + (idCounter++).toString(36);
  return join(tmpdir(), `pi-web-${id}.txt`);
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
  writeFileSync(filePath, content, "utf-8");
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
}
