import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "package.json"), "utf-8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("package.json dependency hygiene", () => {
  it("does not depend on the unmaintained pdf-parse package", () => {
    expect(pkg.dependencies?.["pdf-parse"]).toBeUndefined();
    expect(pkg.devDependencies?.["pdf-parse"]).toBeUndefined();
  });

  it("declares unpdf as a runtime dependency", () => {
    expect(pkg.dependencies?.["unpdf"]).toBeDefined();
  });
});
