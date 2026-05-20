import { statSync } from "node:fs";
import type { PlatformAdapter } from "@handagent/core/platform/PlatformAdapter.ts";
import type { WorkspaceRegistry } from "@handagent/core/workspace/Workspace.ts";
import type { WorkspaceAskResolver } from "@handagent/core/tools/builtins/WorkspaceAskUserTool.ts";
import {
  loadToolSettings,
  toolSettingsFilePath,
  type ToolSettings,
} from "@handagent/core/config/ToolSettings.ts";
import { registerTools } from "@handagent/core/tools/registerTools.ts";
import type { RegisterBuiltinToolsResult } from "@handagent/core/tools/registerBuiltins.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";

type SettingsBackedToolRegistryDependencies = {
  loadToolSettings?: () => ToolSettings;
  readSettingsStamp?: () => string;
  log?: (message: string) => void;
};

export class SettingsBackedToolRegistry {
  readonly registry = new ToolRegistry();
  private readonly loadToolSettings;
  private readonly readSettingsStamp;
  private readonly log;
  private cachedStamp?: string;

  constructor(
    private readonly options: {
      platform: PlatformAdapter;
      workspaceRegistry?: WorkspaceRegistry;
      workspaceAskResolver?: WorkspaceAskResolver;
      pluginsDir?: string;
    },
    dependencies: SettingsBackedToolRegistryDependencies = {},
  ) {
    this.loadToolSettings = dependencies.loadToolSettings ?? loadToolSettings;
    this.readSettingsStamp =
      dependencies.readSettingsStamp ??
      (() => readToolSettingsStamp());
    this.log = dependencies.log ?? ((message) => console.log(message));
  }

  async refresh(): Promise<RegisterBuiltinToolsResult | undefined> {
    const settingsStamp = this.readSettingsStamp();
    if (this.cachedStamp === settingsStamp) {
      return undefined;
    }

    const result = await registerTools({
      registry: this.registry,
      platform: this.options.platform,
      workspaceRegistry: this.options.workspaceRegistry,
      workspaceAskResolver: this.options.workspaceAskResolver,
      settings: this.loadToolSettings(),
      pluginLoaders: [],
    });
    this.cachedStamp = settingsStamp;
    this.logRefresh(result);
    return result;
  }

  private logRefresh(result: RegisterBuiltinToolsResult): void {
    this.log(
      `[agent-server] registered tools: ${result.registered.join(", ") || "(none)"}`,
    );
    for (const disabled of result.disabled) {
      this.log(`[agent-server] disabled tool ${disabled.name}: ${disabled.reason}`);
    }
  }
}

function readToolSettingsStamp(): string {
  return readSingleFileStamp(toolSettingsFilePath());
}

function readSingleFileStamp(filePath: string): string {
  try {
    const stats = statSync(filePath);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch (error) {
    if (isNotFoundError(error)) {
      return "missing";
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
