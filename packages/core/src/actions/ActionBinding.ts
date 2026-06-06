import type { ThreadActionBinding } from "../storage/ThreadRecord.ts";
import type { ActionPluginManifest } from "./PluginManifest.ts";

export type RequestedActionBinding = {
  pluginId: string;
  promptName: string;
};

export function resolveActionBindingFromManifest(
  manifest: ActionPluginManifest,
  request: RequestedActionBinding,
): ThreadActionBinding {
  if (manifest.enabled === false) {
    throw new Error(`Plugin disabled: ${manifest.id}`);
  }
  if (manifest.id !== request.pluginId) {
    throw new Error(`Plugin id mismatch: ${request.pluginId}`);
  }

  const prompt = manifest.prompts.find((item) => item.name === request.promptName);
  if (!prompt) {
    throw new Error(`Plugin prompt not found: ${request.promptName}`);
  }
  if (prompt.kind === "skill") {
    throw new Error(`Plugin prompt is not bindable: ${request.promptName}`);
  }

  return {
    pluginId: manifest.id,
    promptName: prompt.name,
    mcpServerIds: manifest.mcpServerIds,
  };
}
