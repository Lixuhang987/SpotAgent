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
          trigger: "r",
          title: "Review",
          template: "{{code}}",
          arguments: [{ name: "code", required: true }],
        },
      ],
    });

    expect(manifest.id).toBe("review");
    expect(manifest.mcpServerIds).toEqual(["github"]);
    expect(manifest.prompts[0].name).toBe("code_review");
  });

  it("rejects old private tool plugin manifests", () => {
    expect(() =>
      parsePluginManifest({
        id: "echo",
        name: "Echo",
        version: "1.0.0",
        tools: [{ name: "plugin.echo" }],
      }),
    ).toThrow("plugin manifest version must be 1");
  });
});
