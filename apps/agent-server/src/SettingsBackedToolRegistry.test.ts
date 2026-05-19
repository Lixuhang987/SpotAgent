import { describe, expect, it } from "vitest";
import { OfflinePlatformAdapter } from "@handagent/core/platform/OfflinePlatformAdapter.ts";
import { SettingsBackedToolRegistry } from "./SettingsBackedToolRegistry.ts";

describe("SettingsBackedToolRegistry", () => {
  it("refreshes the existing registry when tool settings stamp changes", () => {
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

    manager.refresh();
    expect(manager.registry.get("screen.capture")).toBeDefined();

    denylist = ["screen.capture"];
    stamp = "v2";
    manager.refresh();

    expect(manager.registry.get("screen.capture")).toBeUndefined();
    expect(manager.registry.list().map((tool) => tool.name)).not.toContain(
      "screen.capture",
    );
  });

  it("skips reload when settings stamp is unchanged", () => {
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

    manager.refresh();
    manager.refresh();

    expect(loadCount).toBe(1);
  });
});
