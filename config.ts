import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const CONFIG_TTL_MS = 30_000;

export interface GitHubConfig {
  maxRepoSizeMB: number;
  cloneTimeoutSeconds: number;
  clonePath: string;
}

export interface WebToolsConfig {
  exaApiKey: string | null;
  github: GitHubConfig;
}

const DEFAULT_CONFIG: WebToolsConfig = {
  exaApiKey: null,
  github: {
    maxRepoSizeMB: 350,
    cloneTimeoutSeconds: 30,
    clonePath: "/tmp/pi-github-repos",
  },
};

let cachedConfig: WebToolsConfig | null = null;
let cacheTimestamp = 0;

function getConfigPath(): string {
  return process.env["PI_WEB_TOOLS_CONFIG"] ?? join(homedir(), ".pi", "web-tools.json");
}

function loadConfigFromFile(): Record<string, unknown> {
  try {
    const raw = readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function buildConfig(): WebToolsConfig {
  const file = loadConfigFromFile();
  const fileGithub = (file["github"] && typeof file["github"] === "object" && !Array.isArray(file["github"]))
    ? file["github"] as Record<string, unknown>
    : {};

  const github: GitHubConfig = {
    maxRepoSizeMB: typeof fileGithub["maxRepoSizeMB"] === "number"
      ? fileGithub["maxRepoSizeMB"]
      : DEFAULT_CONFIG.github.maxRepoSizeMB,
    cloneTimeoutSeconds: typeof fileGithub["cloneTimeoutSeconds"] === "number"
      ? fileGithub["cloneTimeoutSeconds"]
      : DEFAULT_CONFIG.github.cloneTimeoutSeconds,
    clonePath: typeof fileGithub["clonePath"] === "string"
      ? fileGithub["clonePath"]
      : DEFAULT_CONFIG.github.clonePath,
  };

  // Env var EXA_API_KEY takes priority over file
  const envKey = process.env["EXA_API_KEY"];
  let exaApiKey: string | null;
  if (envKey !== undefined && envKey !== "") {
    exaApiKey = envKey;
  } else if (typeof file["exaApiKey"] === "string") {
    exaApiKey = file["exaApiKey"];
  } else {
    exaApiKey = DEFAULT_CONFIG.exaApiKey;
  }

  return { exaApiKey, github };
}

export function getConfig(): WebToolsConfig {
  const now = Date.now();
  if (cachedConfig !== null && now - cacheTimestamp < CONFIG_TTL_MS) {
    return cachedConfig;
  }
  cachedConfig = buildConfig();
  cacheTimestamp = now;
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}
