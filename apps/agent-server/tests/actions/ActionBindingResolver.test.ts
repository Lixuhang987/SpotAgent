import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ActionBindingResolver } from "../../src/actions/ActionBindingResolver.ts";

describe("ActionBindingResolver", () => {
  it("resolves prompt binding from plugin manifest", async () => {
    const pluginsDir = await makePlugin({
      id: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
    const resolver = new ActionBindingResolver({ pluginsDir });

    await expect(
      resolver.resolve({ pluginId: "review", promptName: "code_review" }),
    ).resolves.toEqual({
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
  });

  it("rejects directory id mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "action-binding-"));
    const pluginDir = join(root, "plugins", "wrong");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        version: 1,
        id: "actual",
        title: "Actual",
        prompts: [{ name: "p", trigger: "p", title: "P", template: "{{value}}" }],
      }),
    );

    const resolver = new ActionBindingResolver({ pluginsDir: join(root, "plugins") });
    await expect(
      resolver.resolve({ pluginId: "wrong", promptName: "p" }),
    ).rejects.toThrow("plugin id must match directory name");
  });

  it("rejects skill prompts because they do not activate plugin tools", async () => {
    const pluginsDir = await makePlugin({
      id: "weather",
      promptName: "current",
      promptKind: "skill",
      mcpServerIds: ["weather-tools"],
    });
    const resolver = new ActionBindingResolver({ pluginsDir });

    await expect(
      resolver.resolve({ pluginId: "weather", promptName: "current" }),
    ).rejects.toThrow("Plugin prompt is not bindable: current");
  });
});

async function makePlugin({
  id,
  promptName,
  promptKind,
  mcpServerIds,
}: {
  id: string;
  promptName: string;
  promptKind?: "plugin" | "skill";
  mcpServerIds: string[];
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "action-binding-"));
  const pluginsDir = join(root, "plugins");
  const pluginDir = join(pluginsDir, id);
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, "plugin.json"),
    JSON.stringify({
      version: 1,
      id,
      title: id,
      enabled: true,
      mcpServerIds,
      prompts: [
        {
          name: promptName,
          kind: promptKind,
          trigger: "r",
          title: "Review",
          template: "{{code}}",
        },
      ],
    }),
  );
  return pluginsDir;
}
