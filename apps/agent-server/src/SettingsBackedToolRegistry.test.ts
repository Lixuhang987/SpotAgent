import { describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OfflinePlatformAdapter } from "@handagent/core/platform/OfflinePlatformAdapter.ts";
import { SettingsBackedToolRegistry } from "./SettingsBackedToolRegistry.ts";

describe("SettingsBackedToolRegistry", () => {
  it("refreshes the existing registry when tool settings stamp changes", async () => {
    const platform = new OfflinePlatformAdapter();
    let stamp = "v1";
    let denylist: string[] = [];
    const manager = new SettingsBackedToolRegistry(
      { platform },
      {
        readSettingsStamp: () => stamp,
        loadToolSettings: () => ({ allowlist: null, denylist }),
        log: () => {},
      },
    );

    await manager.refresh();
    expect(manager.registry.get("screen.capture")).toBeDefined();

    denylist = ["screen.capture"];
    stamp = "v2";
    await manager.refresh();

    expect(manager.registry.get("screen.capture")).toBeUndefined();
    expect(manager.registry.list().map((tool) => tool.name)).not.toContain(
      "screen.capture",
    );
  });

  it("skips reload when settings stamp is unchanged", async () => {
    const platform = new OfflinePlatformAdapter();
    let loadCount = 0;
    const manager = new SettingsBackedToolRegistry(
      { platform },
      {
        readSettingsStamp: () => "v1",
        loadToolSettings: () => {
          loadCount += 1;
          return { allowlist: null, denylist: [] };
        },
        log: () => {},
      },
    );

    await manager.refresh();
    await manager.refresh();

    expect(loadCount).toBe(1);
  });

  it("loads local plugins and applies denylist to plugin tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "settings-plugin-registry-"));
    const pluginsDir = join(root, "plugins");
    const pluginDir = join(pluginsDir, "echo");
    await mkdir(pluginDir, { recursive: true });
    const commandPath = join(pluginDir, "echo.js");
    await writeFile(commandPath, "#!/usr/bin/env node\nprocess.stdout.write('{}');\n", "utf8");
    await chmod(commandPath, 0o755);
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        id: "echo",
        name: "Echo",
        version: "1.0.0",
        tools: [
          {
            name: "plugin.echo",
            description: "Echo",
            inputSchema: { type: "object" },
            command: "echo.js",
          },
        ],
      }),
      "utf8",
    );

    let denylist: string[] = [];
    let stamp = "v1";
    const manager = new SettingsBackedToolRegistry(
      { platform: new OfflinePlatformAdapter(), pluginsDir },
      {
        readSettingsStamp: () => stamp,
        loadToolSettings: () => ({ allowlist: null, denylist }),
        log: () => {},
      },
    );

    await manager.refresh();
    expect(manager.registry.get("plugin.echo")).toBeDefined();

    denylist = ["plugin.echo"];
    stamp = "v2";
    await manager.refresh();

    expect(manager.registry.get("plugin.echo")).toBeUndefined();
  });
});
