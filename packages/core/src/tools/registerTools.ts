import type { PlatformAdapter } from "../platform/PlatformAdapter.ts";
import type { WorkspaceRegistry } from "../workspace/Workspace.ts";
import { filterToolNames, type ToolSettings } from "../config/ToolSettings.ts";
import type { AgentTool } from "./AgentTool.ts";
import { ToolRegistry } from "./ToolRegistry.ts";
import {
  buildBuiltinToolCandidates,
  type RegisterBuiltinToolsResult,
} from "./registerBuiltins.ts";
import type { WorkspaceAskResolver } from "./builtins/WorkspaceAskUserTool.ts";
import type { PluginToolsLoadResult } from "./plugins/loadLocalPluginTools.ts";

export type RegisterToolsOptions = {
  registry?: ToolRegistry;
  platform: PlatformAdapter;
  workspaceRegistry?: WorkspaceRegistry;
  workspaceAskResolver?: WorkspaceAskResolver;
  settings?: ToolSettings;
  pluginLoaders?: Array<() => Promise<PluginToolsLoadResult>>;
};

export async function registerTools(
  options: RegisterToolsOptions,
): Promise<RegisterBuiltinToolsResult> {
  const registry = options.registry ?? new ToolRegistry();
  const settings = options.settings ?? { allowlist: null, denylist: [] };
  const builtin = buildBuiltinToolCandidates(options);
  const disabled = [...builtin.disabled];
  const builtinNames = new Set(builtin.candidates.map((tool) => tool.name));

  const pluginLoadResults = await Promise.all(
    (options.pluginLoaders ?? []).map((load) => load()),
  );
  const pluginTools = pluginLoadResults.flatMap((result) => result.tools);
  disabled.push(...pluginLoadResults.flatMap((result) => result.disabled));

  const pluginCounts = new Map<string, number>();
  for (const tool of pluginTools) {
    pluginCounts.set(tool.name, (pluginCounts.get(tool.name) ?? 0) + 1);
  }

  const acceptedPluginTools: AgentTool[] = [];
  const conflictDisabledNames = new Set<string>();
  for (const tool of pluginTools) {
    if (builtinNames.has(tool.name)) {
      conflictDisabledNames.add(`${tool.name}:builtin`);
      continue;
    }
    if ((pluginCounts.get(tool.name) ?? 0) > 1) {
      conflictDisabledNames.add(`${tool.name}:duplicate`);
      continue;
    }
    acceptedPluginTools.push(tool);
  }

  for (const marker of conflictDisabledNames) {
    const [name, kind] = marker.split(":");
    disabled.push({
      name,
      reason:
        kind === "builtin"
          ? "plugin tool conflicts with builtin"
          : "duplicate plugin tool name",
    });
  }

  const candidates = [...builtin.candidates, ...acceptedPluginTools];
  const filtered = filterToolNames(
    candidates.map((tool) => tool.name),
    settings,
  );
  disabled.push(...filtered.disabled);

  const enabledSet = new Set(filtered.enabled);
  const enabledTools = candidates.filter((tool) => enabledSet.has(tool.name));
  registry.replaceAll(enabledTools);

  return {
    registry,
    registered: enabledTools.map((tool) => tool.name),
    disabled,
  };
}
