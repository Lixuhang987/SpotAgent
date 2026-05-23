import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../../src/actions/PluginManifest.ts";

describe("parsePluginManifest", () => {
  it("parses plugin prompts and mcp server ids", () => {
    const manifest = parsePluginManifest({
      version: 1,
      id: "review",
      title: "Review",
      enabled: true,
      mcpServerIds: ["github"],
      prompts: [
        {
          name: "code_review",
          kind: "plugin",
          trigger: "r",
          title: "Review",
          template: "{{code}}",
          globalShortcut: { key: "r", modifiers: ["command", "shift"] },
          arguments: [{ name: "code", required: true }],
        },
      ],
    });

    expect(manifest.id).toBe("review");
    expect(manifest.mcpServerIds).toEqual(["github"]);
    expect(manifest.prompts[0].name).toBe("code_review");
    expect(manifest.prompts[0].kind).toBe("plugin");
    expect(manifest.prompts[0].globalShortcut).toEqual({
      key: "r",
      modifiers: ["command", "shift"],
    });
  });

  it("parses skill prompts without plugin binding behavior", () => {
    const manifest = parsePluginManifest({
      version: 1,
      id: "weather",
      title: "Weather",
      prompts: [
        {
          name: "current",
          kind: "skill",
          trigger: "weather",
          title: "Current Weather",
          template: "Check current weather",
        },
      ],
    });

    expect(manifest.prompts[0].kind).toBe("skill");
    expect(manifest.prompts[0].arguments).toEqual([]);
  });

  it("rejects old external tool manifests", () => {
    const legacyToolName = "plugin" + ".echo";

    expect(() =>
      parsePluginManifest({
        id: "echo",
        name: "Echo",
        version: "1.0.0",
        tools: [{ name: legacyToolName }],
      }),
    ).toThrow("plugin manifest version must be 1");
  });
});
