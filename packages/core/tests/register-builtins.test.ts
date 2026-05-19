import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerBuiltinTools } from "../src/tools/registerBuiltins.ts";
import { OfflinePlatformAdapter } from "../src/platform/OfflinePlatformAdapter.ts";
import { FileWorkspaceRegistry } from "../src/workspace/FileWorkspaceRegistry.ts";
import { ToolRegistry } from "../src/tools/ToolRegistry.ts";

async function makeRegistry() {
  const dir = await mkdtemp(join(tmpdir(), "register-builtins-"));
  return new FileWorkspaceRegistry({
    filePath: join(dir, "workspaces.json"),
    defaultRootPath: join(dir, "ws"),
  });
}

describe("registerBuiltinTools", () => {
  it("registers all builtin tools when workspace registry, ask resolver, and default settings are provided", async () => {
    const platform = new OfflinePlatformAdapter();
    const workspaceRegistry = await makeRegistry();

    const { registry, registered, disabled } = registerBuiltinTools({
      platform,
      workspaceRegistry,
      workspaceAskResolver: async () => ({ cancelled: true }),
    });

    expect(registered.sort()).toEqual(
      [
        "accessibility.action",
        "accessibility.snapshot",
        "app.frontmost",
        "clipboard.read",
        "file.read",
        "file.write",
        "ocr.read",
        "screen.capture",
        "window.list",
        "workspace.askUser",
        "workspace.list",
      ].sort(),
    );
    expect(disabled).toEqual([]);
    expect(registry.list().map((t) => t.name).sort()).toEqual(registered.sort());
  });

  it("disables file tools when workspace registry is missing", async () => {
    const platform = new OfflinePlatformAdapter();
    const { registered, disabled } = registerBuiltinTools({ platform });

    expect(registered).not.toContain("file.read");
    expect(registered).not.toContain("file.write");
    expect(registered).not.toContain("workspace.askUser");
    expect(disabled.find((d) => d.name === "file.read")?.reason).toContain(
      "workspace registry",
    );
    expect(disabled.find((d) => d.name === "workspace.askUser")?.reason).toContain(
      "workspace registry",
    );
  });

  it("disables workspace.askUser when ask resolver is missing", async () => {
    const platform = new OfflinePlatformAdapter();
    const workspaceRegistry = await makeRegistry();
    const { registered, disabled } = registerBuiltinTools({ platform, workspaceRegistry });

    expect(registered).not.toContain("workspace.askUser");
    expect(disabled.find((d) => d.name === "workspace.askUser")?.reason).toContain(
      "workspace ask resolver",
    );
  });

  it("respects denylist", async () => {
    const platform = new OfflinePlatformAdapter();
    const workspaceRegistry = await makeRegistry();

    const { registered, disabled } = registerBuiltinTools({
      platform,
      workspaceRegistry,
      settings: { allowlist: null, denylist: ["screen.capture", "ocr.read"] },
    });

    expect(registered).not.toContain("screen.capture");
    expect(registered).not.toContain("ocr.read");
    expect(disabled.find((d) => d.name === "screen.capture")?.reason).toBe("denylist");
  });

  it("respects allowlist (only listed tools enabled)", async () => {
    const platform = new OfflinePlatformAdapter();
    const workspaceRegistry = await makeRegistry();

    const { registered, disabled } = registerBuiltinTools({
      platform,
      workspaceRegistry,
      workspaceAskResolver: async () => ({ cancelled: true }),
      settings: { allowlist: ["file.read", "clipboard.read"], denylist: [] },
    });

    expect(registered.sort()).toEqual(["clipboard.read", "file.read"]);
    expect(disabled.some((d) => d.name === "screen.capture")).toBe(true);
  });

  it("re-registers tools into an existing registry when settings change", async () => {
    const platform = new OfflinePlatformAdapter();
    const workspaceRegistry = await makeRegistry();
    const registry = new ToolRegistry();

    registerBuiltinTools({
      registry,
      platform,
      workspaceRegistry,
      settings: { allowlist: null, denylist: [] },
    });
    expect(registry.get("screen.capture")).toBeDefined();

    registerBuiltinTools({
      registry,
      platform,
      workspaceRegistry,
      settings: { allowlist: null, denylist: ["screen.capture"] },
    });

    expect(registry.get("screen.capture")).toBeUndefined();
    expect(registry.list().map((tool) => tool.name)).not.toContain("screen.capture");
  });

  it("OfflinePlatformAdapter throws helpful error when adapter is invoked", async () => {
    const platform = new OfflinePlatformAdapter();
    await expect(platform.captureScreen({})).rejects.toThrow(/screen.capture/);
  });
});
