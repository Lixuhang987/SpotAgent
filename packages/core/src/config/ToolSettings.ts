import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ToolSettings = {
  allowlist: string[] | null;
  denylist: string[];
};

export const defaultToolSettings: ToolSettings = {
  allowlist: null,
  denylist: [],
};

type PersistedToolSettings = {
  tools?: {
    allowlist?: unknown;
    denylist?: unknown;
  };
};

export function toolSettingsFilePath(homeDir = homedir()): string {
  return join(homeDir, ".spotAgent", "settings.json");
}

export function loadToolSettings(homeDir = homedir()): ToolSettings {
  const filePath = toolSettingsFilePath(homeDir);
  if (!existsSync(filePath)) {
    return defaultToolSettings;
  }

  let parsed: PersistedToolSettings;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as PersistedToolSettings;
  } catch {
    return defaultToolSettings;
  }

  const tools = parsed.tools ?? {};
  return {
    allowlist: normalizeList(tools.allowlist),
    denylist: normalizeList(tools.denylist) ?? [],
  };
}

function normalizeList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter((entry): entry is string => typeof entry === "string");
  return list.length > 0 ? list : null;
}

export function filterToolNames(
  candidates: string[],
  settings: ToolSettings,
): { enabled: string[]; disabled: { name: string; reason: string }[] } {
  const disabled: { name: string; reason: string }[] = [];
  const enabled: string[] = [];

  const denySet = new Set(settings.denylist);
  const allowSet = settings.allowlist ? new Set(settings.allowlist) : null;

  for (const name of candidates) {
    if (denySet.has(name)) {
      disabled.push({ name, reason: "denylist" });
      continue;
    }
    if (allowSet && !allowSet.has(name)) {
      disabled.push({ name, reason: "not in allowlist" });
      continue;
    }
    enabled.push(name);
  }

  return { enabled, disabled };
}
