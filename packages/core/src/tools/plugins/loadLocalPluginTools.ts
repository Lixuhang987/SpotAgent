import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTool } from "../AgentTool.ts";
import type { WorkspaceRegistry } from "../../workspace/Workspace.ts";
import { parsePluginManifest } from "./PluginManifest.ts";
import { PluginTool } from "./PluginTool.ts";

export type DisabledTool = { name: string; reason: string };

export type PluginToolsLoadResult = {
  tools: AgentTool[];
  disabled: DisabledTool[];
};

export type LocalPluginToolsOptions = {
  pluginsDir: string;
  workspaceRegistry?: WorkspaceRegistry;
};

export async function loadLocalPluginTools(
  options: LocalPluginToolsOptions,
): Promise<PluginToolsLoadResult> {
  const entries = await readdir(options.pluginsDir, { withFileTypes: true }).catch(
    (error: unknown) => {
      if (isNotFoundError(error)) return [];
      throw error;
    },
  );

  const tools: AgentTool[] = [];
  const disabled: DisabledTool[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = join(options.pluginsDir, entry.name);
    const manifestPath = join(pluginDir, "plugin.json");

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      disabled.push({
        name: `plugin:${entry.name}`,
        reason: isJsonParseError(error) ? "invalid manifest JSON" : "plugin manifest not readable",
      });
      continue;
    }

    try {
      const manifest = parsePluginManifest(parsed);
      if (manifest.id !== entry.name) {
        disabled.push({
          name: `plugin:${entry.name}`,
          reason: "plugin id must match directory name",
        });
        continue;
      }
      if (manifest.enabled === false) {
        for (const tool of manifest.tools) {
          disabled.push({ name: tool.name, reason: "plugin disabled" });
        }
        continue;
      }
      for (const tool of manifest.tools) {
        tools.push(
          new PluginTool({
            pluginId: manifest.id,
            pluginDir,
            manifest: tool,
            workspaceRegistry: options.workspaceRegistry,
          }),
        );
      }
    } catch (error) {
      disabled.push({
        name: `plugin:${entry.name}`,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { tools, disabled };
}

function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
