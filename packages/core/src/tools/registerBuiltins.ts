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
import { WorkspaceAskUserTool, type WorkspaceAskResolver } from "./builtins/WorkspaceAskUserTool.ts";
import { WorkspaceListTool } from "./builtins/WorkspaceListTool.ts";

export type RegisterBuiltinToolsOptions = {
  registry?: ToolRegistry;
  platform: PlatformAdapter;
  workspaceRegistry?: WorkspaceRegistry;
  workspaceAskResolver?: WorkspaceAskResolver;
  settings?: ToolSettings;
};

export type RegisterBuiltinToolsResult = {
  registry: ToolRegistry;
  registered: string[];
  disabled: { name: string; reason: string }[];
};

export type BuiltinToolCandidatesResult = {
  candidates: AgentTool[];
  disabled: { name: string; reason: string }[];
};

export function buildBuiltinToolCandidates(
  options: Omit<RegisterBuiltinToolsOptions, "registry" | "settings">,
): BuiltinToolCandidatesResult {
  const candidates: AgentTool[] = [
    ClipboardReadTool.create(options.platform),
    FrontmostAppTool.create(options.platform),
    WindowListTool.create(options.platform),
    ScreenCaptureTool.create(options.platform),
    OCRTool.create(options.platform),
    AccessibilitySnapshotTool.create(options.platform),
    AccessibilityActionTool.create(options.platform),
  ];

  const disabled: { name: string; reason: string }[] = [];

  if (options.workspaceRegistry) {
    candidates.push(WorkspaceListTool.create(options.workspaceRegistry));
    candidates.push(FileReadTool.create(options.workspaceRegistry));
    candidates.push(FileWriteTool.create(options.workspaceRegistry));
    if (options.workspaceAskResolver) {
      candidates.push(
        WorkspaceAskUserTool.create({
          registry: options.workspaceRegistry,
          askResolver: options.workspaceAskResolver,
        }),
      );
    }
  }

  if (!options.workspaceRegistry) {
    disabled.push(
      { name: "workspace.list", reason: "workspace registry not provided" },
      { name: "workspace.askUser", reason: "workspace registry not provided" },
      { name: "file.read", reason: "workspace registry not provided" },
      { name: "file.write", reason: "workspace registry not provided" },
    );
  }
  if (options.workspaceRegistry && !options.workspaceAskResolver) {
    disabled.push({
      name: "workspace.askUser",
      reason: "workspace ask resolver not provided",
    });
  }

  return { candidates, disabled };
}

export function registerBuiltinTools(
  options: RegisterBuiltinToolsOptions,
): RegisterBuiltinToolsResult {
  const registry = options.registry ?? new ToolRegistry();
  const settings = options.settings ?? { allowlist: null, denylist: [] };
  const { candidates, disabled } = buildBuiltinToolCandidates(options);

  const candidateNames = candidates.map((t) => t.name);
  const filtered = filterToolNames(candidateNames, settings);
  disabled.push(...filtered.disabled);

  const enabledSet = new Set(filtered.enabled);
  const registered: string[] = [];
  const enabledTools: AgentTool[] = [];
  for (const tool of candidates) {
    if (!enabledSet.has(tool.name)) continue;
    enabledTools.push(tool);
    registered.push(tool.name);
  }
  registry.replaceAll(enabledTools);

  return { registry, registered, disabled };
}
