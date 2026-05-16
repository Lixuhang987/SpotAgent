import type { PlatformAdapter } from "../platform/PlatformAdapter.ts";
import type { WorkspaceRegistry } from "../workspace/Workspace.ts";
import { filterToolNames, type ToolSettings } from "../config/ToolSettings.ts";
import type { AgentTool } from "./AgentTool.ts";
import { ToolRegistry } from "./ToolRegistry.ts";
import { AccessibilityActionTool } from "./builtins/AccessibilityActionTool.ts";
import { AccessibilitySnapshotTool } from "./builtins/AccessibilitySnapshotTool.ts";
import { ClipboardReadTool } from "./builtins/ClipboardReadTool.ts";
import { FileReadTool } from "./builtins/FileReadTool.ts";
import { FileWriteTool } from "./builtins/FileWriteTool.ts";
import { FrontmostAppTool } from "./builtins/FrontmostAppTool.ts";
import { OCRTool } from "./builtins/OCRTool.ts";
import { ScreenCaptureTool } from "./builtins/ScreenCaptureTool.ts";
import { WindowListTool } from "./builtins/WindowListTool.ts";
import { WorkspaceListTool } from "./builtins/WorkspaceListTool.ts";

export type RegisterBuiltinToolsOptions = {
  registry?: ToolRegistry;
  platform: PlatformAdapter;
  workspaceRegistry?: WorkspaceRegistry;
  settings?: ToolSettings;
};

export type RegisterBuiltinToolsResult = {
  registry: ToolRegistry;
  registered: string[];
  disabled: { name: string; reason: string }[];
};

export function registerBuiltinTools(
  options: RegisterBuiltinToolsOptions,
): RegisterBuiltinToolsResult {
  const registry = options.registry ?? new ToolRegistry();
  const settings = options.settings ?? { allowlist: null, denylist: [] };

  const candidates: AgentTool[] = [
    new ClipboardReadTool(options.platform),
    new FrontmostAppTool(options.platform),
    new WindowListTool(options.platform),
    new ScreenCaptureTool(options.platform),
    new OCRTool(options.platform),
    new AccessibilitySnapshotTool(options.platform),
    new AccessibilityActionTool(options.platform),
  ];

  if (options.workspaceRegistry) {
    candidates.push(new WorkspaceListTool(options.workspaceRegistry));
    candidates.push(new FileReadTool(options.workspaceRegistry));
    candidates.push(new FileWriteTool(options.workspaceRegistry));
  }

  const disabled: { name: string; reason: string }[] = [];
  if (!options.workspaceRegistry) {
    disabled.push(
      { name: "workspace.list", reason: "workspace registry not provided" },
      { name: "file.read", reason: "workspace registry not provided" },
      { name: "file.write", reason: "workspace registry not provided" },
    );
  }

  const candidateNames = candidates.map((t) => t.name);
  const filtered = filterToolNames(candidateNames, settings);
  disabled.push(...filtered.disabled);

  const enabledSet = new Set(filtered.enabled);
  const registered: string[] = [];
  for (const tool of candidates) {
    if (!enabledSet.has(tool.name)) continue;
    registry.register(tool);
    registered.push(tool.name);
  }

  return { registry, registered, disabled };
}
