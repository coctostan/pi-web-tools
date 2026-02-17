import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const CONFIG_TTL_MS = 30_000;

export interface GitHubConfig {
  maxRepoSizeMB: number;
  cloneTimeoutSeconds: number;
  clonePath: string;
}

export interface ToolToggles {
  web_search: boolean;
  code_search: boolean;
  fetch_content: boolean;
  get_search_content: boolean;
}

export interface WebToolsConfig {
  exaApiKey: string | null;
  github: GitHubConfig;
  tools: ToolToggles;
}

const DEFAULT_CONFIG: WebToolsConfig = {
  exaApiKey: null,
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

  const fileTools = (file["tools"] && typeof file["tools"] === "object" && !Array.isArray(file["tools"]))
    ? file["tools"] as Record<string, unknown>
    : {};

  const tools: ToolToggles = {
    web_search: typeof fileTools["web_search"] === "boolean" ? fileTools["web_search"] : DEFAULT_CONFIG.tools.web_search,
    code_search: typeof fileTools["code_search"] === "boolean" ? fileTools["code_search"] : DEFAULT_CONFIG.tools.code_search,
    fetch_content: typeof fileTools["fetch_content"] === "boolean" ? fileTools["fetch_content"] : DEFAULT_CONFIG.tools.fetch_content,
    get_search_content: typeof fileTools["get_search_content"] === "boolean" ? fileTools["get_search_content"] : DEFAULT_CONFIG.tools.get_search_content,
  };

  // Auto-disable get_search_content if all content-producing tools are off
  if (!tools.web_search && !tools.code_search && !tools.fetch_content) {
    tools.get_search_content = false;
  }

  return { exaApiKey, github, tools };
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
