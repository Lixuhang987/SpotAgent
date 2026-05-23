import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../../src/actions/PluginManifest.ts";
import { parseMCPConfig } from "../../src/mcp/MCPConfig.ts";
import { StdioMCPClient } from "../../src/mcp/StdioMCPClient.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const examplesRoot = join(repoRoot, "examples");

describe("example plugin and MCP assets", () => {
  it("ships parseable action plugin manifests that bind to demo MCP servers", async () => {
    const manifests = await loadExamplePluginManifests();

    expect(manifests.map((manifest) => manifest.id)).toEqual([
      "code-review",
      "meeting-notes",
      "release-notes",
    ]);
    for (const manifest of manifests) {
      expect(manifest.enabled).toBe(true);
      expect(manifest.prompts.length).toBeGreaterThan(0);
      expect(manifest.mcpServerIds).toContain("handagent_demo");
    }
  });

  it("ships an MCP config whose server ids cover the example plugin bindings", async () => {
    const manifests = await loadExamplePluginManifests();
    const config = await loadExampleMCPConfig();
    const serverIds = new Set(config.servers.map((server) => server.id));

    for (const manifest of manifests) {
      for (const serverId of manifest.mcpServerIds) {
        expect(serverIds.has(serverId)).toBe(true);
      }
    }
  });

  it("runs the demo MCP server and calls its example tools over stdio", async () => {
    const config = await loadExampleMCPConfig();
    const server = config.servers.find((item) => item.id === "handagent_demo");
    expect(server).toMatchObject({ transport: "stdio" });
    if (!server || server.transport !== "stdio") {
      throw new Error("handagent_demo must be a stdio MCP server");
    }

    const client = new StdioMCPClient({ ...server, cwd: repoRoot });
    try {
      await expect(client.initialize()).resolves.toMatchObject({
        name: "handagent-demo",
      });
      const tools = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "echo",
        "extract_tasks",
        "make_checklist",
      ]);

      await expect(client.callTool("echo", { text: "hello" })).resolves.toEqual({
        content: [{ type: "text", text: "hello" }],
      });
      await expect(
        client.callTool("make_checklist", {
          title: "Ship examples",
          items: ["add plugin manifests", "add MCP tools"],
        }),
      ).resolves.toEqual({
        content: [
          {
            type: "text",
            text: "# Ship examples\n\n- [ ] add plugin manifests\n- [ ] add MCP tools",
          },
        ],
      });
      await expect(
        client.callTool("extract_tasks", {
          text: "Decision: keep it small\nTODO: wire examples into QA\nAction: update docs",
        }),
      ).resolves.toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { tasks: ["wire examples into QA", "update docs"] },
              null,
              2,
            ),
          },
        ],
      });
    } finally {
      await client.close();
    }
  });
});

async function loadExamplePluginManifests() {
  const pluginsDir = join(examplesRoot, "plugins");
  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const manifestPaths = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pluginsDir, entry.name, "plugin.json"))
    .sort();

  return Promise.all(
    manifestPaths.map(async (path) =>
      parsePluginManifest(JSON.parse(await readFile(path, "utf8"))),
    ),
  );
}

async function loadExampleMCPConfig() {
  return parseMCPConfig(
    JSON.parse(await readFile(join(examplesRoot, "mcp", "mcp.example.json"), "utf8")),
  );
}
