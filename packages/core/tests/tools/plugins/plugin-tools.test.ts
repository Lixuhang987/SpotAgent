import { describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OfflinePlatformAdapter } from "../../../src/platform/OfflinePlatformAdapter.ts";
import { FileWorkspaceRegistry } from "../../../src/workspace/FileWorkspaceRegistry.ts";
import { loadLocalPluginTools } from "../../../src/tools/plugins/loadLocalPluginTools.ts";
import { registerTools } from "../../../src/tools/registerTools.ts";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeExecutable(filePath: string, source: string): Promise<void> {
  await writeFile(filePath, source, "utf8");
  await chmod(filePath, 0o755);
}

async function makeWorkspaceRegistry(root: string): Promise<FileWorkspaceRegistry> {
  return new FileWorkspaceRegistry({
    filePath: join(root, "workspaces.json"),
    defaultRootPath: join(root, "workspace"),
    generateId: () => "default",
  });
}

describe("loadLocalPluginTools", () => {
  it("loads a local directory plugin and executes a JSON stdin/stdout tool", async () => {
    const root = await makeTempDir("plugin-tools-");
    const pluginDir = join(root, "plugins", "echo");
    await mkdir(pluginDir, { recursive: true });
    await writeExecutable(
      join(pluginDir, "echo.js"),
      `#!/usr/bin/env node
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(JSON.stringify({ ok: true, input: request.input, context: request.context }));
});
`,
    );
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        id: "echo",
        name: "Echo",
        version: "1.0.0",
        tools: [
          {
            name: "plugin.echo",
            description: "Echo input",
            inputSchema: { type: "object", properties: { text: { type: "string" } } },
            command: "echo.js",
            timeoutMs: 1000,
          },
        ],
      }),
      "utf8",
    );

    const result = await loadLocalPluginTools({ pluginsDir: join(root, "plugins") });

    expect(result.disabled).toEqual([]);
    expect(result.tools.map((tool) => tool.name)).toEqual(["plugin.echo"]);
    await expect(
      result.tools[0].call({ text: "hello" }, { sessionId: "s1", toolCallId: "tc1" }),
    ).resolves.toMatchObject({
      ok: true,
      input: { text: "hello" },
      context: { sessionId: "s1", toolCallId: "tc1", pluginId: "echo", toolName: "plugin.echo" },
    });
  });

  it("disables malformed manifests without throwing", async () => {
    const root = await makeTempDir("plugin-bad-manifest-");
    const pluginDir = join(root, "plugins", "bad");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "plugin.json"), "{", "utf8");

    const result = await loadLocalPluginTools({ pluginsDir: join(root, "plugins") });

    expect(result.tools).toEqual([]);
    expect(result.disabled).toEqual([
      { name: "plugin:bad", reason: "invalid manifest JSON" },
    ]);
  });

  it("disables plugin tool names that conflict with builtins or another plugin", async () => {
    const root = await makeTempDir("plugin-conflicts-");
    const pluginsDir = join(root, "plugins");
    for (const id of ["one", "two"]) {
      const pluginDir = join(pluginsDir, id);
      await mkdir(pluginDir, { recursive: true });
      await writeExecutable(join(pluginDir, "tool.js"), "#!/usr/bin/env node\n");
      await writeFile(
        join(pluginDir, "plugin.json"),
        JSON.stringify({
          id,
          name: id,
          version: "1.0.0",
          tools: [
            {
              name: "clipboard.read",
              description: "builtin conflict",
              inputSchema: { type: "object" },
              command: "tool.js",
            },
            {
              name: "plugin.same",
              description: "duplicate",
              inputSchema: { type: "object" },
              command: "tool.js",
            },
          ],
        }),
        "utf8",
      );
    }

    const result = registerTools({
      platform: new OfflinePlatformAdapter(),
      pluginLoaders: [() => loadLocalPluginTools({ pluginsDir })],
    });

    await expect(result).resolves.toMatchObject({
      registered: expect.not.arrayContaining(["plugin.same"]),
    });
    const resolved = await result;
    expect(resolved.disabled).toContainEqual({
      name: "clipboard.read",
      reason: "plugin tool conflicts with builtin",
    });
    expect(resolved.disabled).toContainEqual({
      name: "plugin.same",
      reason: "duplicate plugin tool name",
    });
  });

  it("returns tool errors for non-zero exit, invalid JSON, and timeout", async () => {
    const root = await makeTempDir("plugin-failures-");
    const pluginDir = join(root, "plugins", "failures");
    await mkdir(pluginDir, { recursive: true });
    await writeExecutable(join(pluginDir, "exit.js"), "#!/usr/bin/env node\nprocess.exit(7);\n");
    await writeExecutable(join(pluginDir, "bad-json.js"), "#!/usr/bin/env node\nprocess.stdout.write('not-json');\n");
    await writeExecutable(join(pluginDir, "sleep.js"), "#!/usr/bin/env node\nsetTimeout(() => {}, 5000);\n");
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        id: "failures",
        name: "Failures",
        version: "1.0.0",
        tools: [
          { name: "plugin.exit", description: "Exit", inputSchema: { type: "object" }, command: "exit.js" },
          { name: "plugin.badJson", description: "Bad JSON", inputSchema: { type: "object" }, command: "bad-json.js" },
          { name: "plugin.timeout", description: "Timeout", inputSchema: { type: "object" }, command: "sleep.js", timeoutMs: 50 },
        ],
      }),
      "utf8",
    );

    const { tools } = await loadLocalPluginTools({ pluginsDir: join(root, "plugins") });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    await expect(byName.get("plugin.exit")?.call({})).rejects.toThrow(/exited with code 7/);
    await expect(byName.get("plugin.badJson")?.call({})).rejects.toThrow(/invalid JSON/);
    await expect(byName.get("plugin.timeout")?.call({})).rejects.toThrow(/timed out/);
  });

  it("rejects plugin commands that resolve outside the plugin directory", async () => {
    const root = await makeTempDir("plugin-command-symlink-");
    const pluginDir = join(root, "plugins", "escape");
    await mkdir(pluginDir, { recursive: true });
    const outsideCommand = join(root, "outside.js");
    await writeExecutable(outsideCommand, "#!/usr/bin/env node\nprocess.stdout.write('{}');\n");
    await symlink(outsideCommand, join(pluginDir, "escape.js"));
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        id: "escape",
        name: "Escape",
        version: "1.0.0",
        tools: [
          {
            name: "plugin.escape",
            description: "Escape",
            inputSchema: { type: "object" },
            command: "escape.js",
          },
        ],
      }),
      "utf8",
    );

    const { tools } = await loadLocalPluginTools({ pluginsDir: join(root, "plugins") });

    await expect(tools[0].call({})).rejects.toThrow(/escapes plugin directory/);
  });

  it("stops plugin tools that exceed the output limit", async () => {
    const root = await makeTempDir("plugin-output-limit-");
    const pluginDir = join(root, "plugins", "chatty");
    await mkdir(pluginDir, { recursive: true });
    await writeExecutable(
      join(pluginDir, "chatty.js"),
      "#!/usr/bin/env node\nprocess.stdout.write('x'.repeat(1024 * 1024 + 1));\n",
    );
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        id: "chatty",
        name: "Chatty",
        version: "1.0.0",
        tools: [
          {
            name: "plugin.chatty",
            description: "Chatty",
            inputSchema: { type: "object" },
            command: "chatty.js",
          },
        ],
      }),
      "utf8",
    );

    const { tools } = await loadLocalPluginTools({ pluginsDir: join(root, "plugins") });

    await expect(tools[0].call({})).rejects.toThrow(/exceeded output limit/);
  });

  it("resolves declared workspace inputs before invoking the plugin and blocks escapes", async () => {
    const root = await makeTempDir("plugin-workspace-");
    const registry = await makeWorkspaceRegistry(root);
    await registry.getDefault();

    const pluginDir = join(root, "plugins", "workspace");
    await mkdir(pluginDir, { recursive: true });
    await writeExecutable(
      join(pluginDir, "workspace.js"),
      `#!/usr/bin/env node
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(JSON.stringify(request.workspace));
});
`,
    );
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        id: "workspace",
        name: "Workspace",
        version: "1.0.0",
        tools: [
          {
            name: "plugin.workspace",
            description: "Workspace",
            inputSchema: { type: "object" },
            command: "workspace.js",
            permissions: { workspace: "read" },
          },
        ],
      }),
      "utf8",
    );

    const { tools } = await loadLocalPluginTools({
      pluginsDir: join(root, "plugins"),
      workspaceRegistry: registry,
    });
    const workspaceRoot = await realpath(join(root, "workspace"));

    await expect(
      tools[0].call({ workspaceId: "default", relativePath: "notes/a.txt" }),
    ).resolves.toMatchObject({
      workspaceId: "default",
      relativePath: "notes/a.txt",
      workspaceRoot,
      absolutePath: join(workspaceRoot, "notes", "a.txt"),
    });
    await expect(
      tools[0].call({ workspaceId: "default", relativePath: "../escape.txt" }),
    ).rejects.toThrow(/escapes workspace root/);
  });

  it("honors tool denylist for plugin tools", async () => {
    const root = await makeTempDir("plugin-denylist-");
    const pluginDir = join(root, "plugins", "echo");
    await mkdir(pluginDir, { recursive: true });
    await writeExecutable(join(pluginDir, "echo.js"), "#!/usr/bin/env node\n");
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

    const result = await registerTools({
      platform: new OfflinePlatformAdapter(),
      settings: { allowlist: null, denylist: ["plugin.echo"] },
      pluginLoaders: [() => loadLocalPluginTools({ pluginsDir: join(root, "plugins") })],
    });

    expect(result.registry.get("plugin.echo")).toBeUndefined();
    expect(result.disabled).toContainEqual({ name: "plugin.echo", reason: "denylist" });
  });
});
