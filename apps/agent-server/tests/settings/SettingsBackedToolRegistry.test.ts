import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OfflinePlatformAdapter } from "@handagent/core/platform/OfflinePlatformAdapter.ts";
import { SettingsBackedToolRegistry } from "../../src/SettingsBackedToolRegistry.ts";

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

  it("does not register legacy external tools", async () => {
    const legacyToolName = "plugin" + ".echo";
    const manager = new SettingsBackedToolRegistry(
      { platform: new OfflinePlatformAdapter() },
      {
        readSettingsStamp: () => "v1",
        loadToolSettings: () => ({ allowlist: null, denylist: [] }),
        log: () => {},
      },
    );

    await manager.refresh();

    expect(manager.registry.list().map((tool) => tool.name)).not.toContain(
      legacyToolName,
    );
  });
});
