import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function listSourceTs(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".pi" || entry === ".git" || entry === ".worktrees") continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) listSourceTs(full, acc);
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

describe("npm scope rescope", () => {
  it("no source .ts file imports from @mariozechner/*", () => {
    const offenders: string[] = [];
    for (const file of listSourceTs(".")) {
      const src = readFileSync(file, "utf8");
      if (/from\s+["']@mariozechner\//.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("package.json peerDependencies are on @earendil-works/* scope at ^0.74", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.peerDependencies).toBeDefined();
    expect(Object.keys(pkg.peerDependencies).sort()).toEqual([
      "@earendil-works/pi-coding-agent",
      "@earendil-works/pi-tui",
      "typebox",
    ]);
    expect(pkg.peerDependencies["@earendil-works/pi-coding-agent"]).toBe("^0.74.0");
    expect(pkg.peerDependencies["@earendil-works/pi-tui"]).toBe("^0.74.0");
    expect(pkg.peerDependencies["@mariozechner/pi-coding-agent"]).toBeUndefined();
    expect(pkg.peerDependencies["@mariozechner/pi-tui"]).toBeUndefined();
    expect(pkg.peerDependencies["@sinclair/typebox"]).toBeUndefined();
  });

  it("package.json version bumped to 4.0.0", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.version).toBe("4.0.0");
  });
});
