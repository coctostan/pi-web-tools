import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getConfig, resetConfigCache, CONFIG_TTL_MS, type WebToolsConfig } from "./config.js";

describe("config", () => {
  let tempDir: string;
  let configPath: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-web-tools-config-test-"));
    configPath = join(tempDir, "web-tools.json");
    // Save and override env
    originalEnv["PI_WEB_TOOLS_CONFIG"] = process.env["PI_WEB_TOOLS_CONFIG"];
    originalEnv["EXA_API_KEY"] = process.env["EXA_API_KEY"];
    process.env["PI_WEB_TOOLS_CONFIG"] = configPath;
    delete process.env["EXA_API_KEY"];
    resetConfigCache();
  });

  afterEach(() => {
    // Restore env
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    // Cleanup temp dir
    rmSync(tempDir, { recursive: true, force: true });
    resetConfigCache();
  });

  it("exports CONFIG_TTL_MS as 30000", () => {
    expect(CONFIG_TTL_MS).toBe(30_000);
  });

  it("returns defaults when no config file exists", () => {
    const config = getConfig();
    expect(config.exaApiKey).toBeNull();
    expect(config.github.maxRepoSizeMB).toBe(350);
    expect(config.github.cloneTimeoutSeconds).toBe(30);
    expect(config.github.clonePath).toBe("/tmp/pi-github-repos");
  });

  it("reads config from file correctly", () => {
    const fileConfig = {
      exaApiKey: "test-key-from-file",
      github: {
        maxRepoSizeMB: 500,
        cloneTimeoutSeconds: 60,
        clonePath: "/custom/path",
      },
    };
    writeFileSync(configPath, JSON.stringify(fileConfig));
    resetConfigCache();

    const config = getConfig();
    expect(config.exaApiKey).toBe("test-key-from-file");
    expect(config.github.maxRepoSizeMB).toBe(500);
    expect(config.github.cloneTimeoutSeconds).toBe(60);
    expect(config.github.clonePath).toBe("/custom/path");
  });

  it("merges partial config with defaults", () => {
    const fileConfig = {
      github: {
        maxRepoSizeMB: 100,
      },
    };
    writeFileSync(configPath, JSON.stringify(fileConfig));
    resetConfigCache();

    const config = getConfig();
    expect(config.exaApiKey).toBeNull();
    expect(config.github.maxRepoSizeMB).toBe(100);
    expect(config.github.cloneTimeoutSeconds).toBe(30);
    expect(config.github.clonePath).toBe("/tmp/pi-github-repos");
  });

  it("EXA_API_KEY env var overrides config file", () => {
    const fileConfig = { exaApiKey: "file-key" };
    writeFileSync(configPath, JSON.stringify(fileConfig));
    process.env["EXA_API_KEY"] = "env-key-override";
    resetConfigCache();

    const config = getConfig();
    expect(config.exaApiKey).toBe("env-key-override");
  });

  it("caches config and resetConfigCache clears it", () => {
    // First call: no file, defaults
    const config1 = getConfig();
    expect(config1.exaApiKey).toBeNull();

    // Write a config file — cached result should still return null
    writeFileSync(configPath, JSON.stringify({ exaApiKey: "new-key" }));
    const config2 = getConfig();
    expect(config2.exaApiKey).toBeNull(); // still cached

    // Reset cache — now it should pick up the file
    resetConfigCache();
    const config3 = getConfig();
    expect(config3.exaApiKey).toBe("new-key");
  });

  it("handles malformed JSON gracefully", () => {
    writeFileSync(configPath, "{ not valid json !!!");
    resetConfigCache();

    const config = getConfig();
    // Should return defaults, no throw
    expect(config.exaApiKey).toBeNull();
    expect(config.github.maxRepoSizeMB).toBe(350);
    expect(config.github.cloneTimeoutSeconds).toBe(30);
    expect(config.github.clonePath).toBe("/tmp/pi-github-repos");
  });

  it("defaults all tools to true when tools block is missing", () => {
    writeFileSync(configPath, JSON.stringify({}));
    resetConfigCache();
    const config = getConfig();
    expect(config.tools.web_search).toBe(true);
    expect(config.tools.code_search).toBe(true);
    expect(config.tools.fetch_content).toBe(true);
    expect(config.tools.get_search_content).toBe(true);
  });

  it("respects explicit tool toggle values", () => {
    writeFileSync(configPath, JSON.stringify({
      tools: { web_search: false, fetch_content: false }
    }));
    resetConfigCache();
    const config = getConfig();
    expect(config.tools.web_search).toBe(false);
    expect(config.tools.code_search).toBe(true);
    expect(config.tools.fetch_content).toBe(false);
    expect(config.tools.get_search_content).toBe(true);
  });

  it("keeps get_search_content when search tools off but fetch_content on", () => {
    writeFileSync(configPath, JSON.stringify({
      tools: { web_search: false, code_search: false, get_search_content: true }
    }));
    resetConfigCache();
    const config = getConfig();
    expect(config.tools.get_search_content).toBe(true);
  });

  it("keeps get_search_content enabled when at least one search tool is on", () => {
    writeFileSync(configPath, JSON.stringify({
      tools: { web_search: false, code_search: true }
    }));
    resetConfigCache();
    const config = getConfig();
    expect(config.tools.get_search_content).toBe(true);
  });

  it("keeps get_search_content enabled when only fetch_content is on", () => {
    writeFileSync(configPath, JSON.stringify({
      tools: { web_search: false, code_search: false, fetch_content: true }
    }));
    resetConfigCache();
    const config = getConfig();
    expect(config.tools.get_search_content).toBe(true);
  });

  it("auto-disables get_search_content only when all content tools are disabled", () => {
    writeFileSync(configPath, JSON.stringify({
      tools: { web_search: false, code_search: false, fetch_content: false, get_search_content: true }
    }));
    resetConfigCache();
    const config = getConfig();
    expect(config.tools.get_search_content).toBe(false);
  });
});
