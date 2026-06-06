import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ThreadActionBinding } from "@handagent/core/storage/index.ts";
import { parsePluginManifest } from "@handagent/core/actions/PluginManifest.ts";
import {
  resolveActionBindingFromManifest,
  type RequestedActionBinding,
} from "@handagent/core/actions/ActionBinding.ts";

export class ActionBindingResolver {
  constructor(private readonly options: { pluginsDir: string }) {}

  async resolve(binding: RequestedActionBinding): Promise<ThreadActionBinding> {
    const pluginDir = join(this.options.pluginsDir, binding.pluginId);
    const manifestPath = join(pluginDir, "plugin.json");
    const raw = await readFile(manifestPath, "utf8");
    const manifest = parsePluginManifest(JSON.parse(raw));

    if (manifest.id !== binding.pluginId) {
      throw new Error("plugin id must match directory name");
    }

    return resolveActionBindingFromManifest(manifest, binding);
  }
}
