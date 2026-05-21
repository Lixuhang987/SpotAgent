import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { StdioMCPClient } from "../../src/mcp/StdioMCPClient.ts";

describe("StdioMCPClient with @modelcontextprotocol/server-filesystem", () => {
  it("connects to a real MCP server and exercises tools + resources", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "mcp-fs-")));
    await writeFile(join(dir, "hello.txt"), "Hello from MCP test", "utf8");

    const client = new StdioMCPClient({
      id: "filesystem",
      title: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["--yes", "@modelcontextprotocol/server-filesystem", dir],
    });

    const info = await client.initialize();
    expect(info.protocolVersion).toBe("2025-11-25");
    expect(info.capabilities.tools).toBeDefined();

    const tools = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("list_directory");

    const listResult = await client.callTool("list_directory", { path: dir });
    expect(listResult.isError).not.toBe(true);
    const listText = (listResult.content as Array<{ text?: string }>)
      ?.map((c) => c.text)
      .join("");
    expect(listText).toContain("hello.txt");

    const readResult = await client.callTool("read_file", { path: join(dir, "hello.txt") });
    expect(readResult.isError).not.toBe(true);
    const readText = (readResult.content as Array<{ text?: string }>)
      ?.map((c) => c.text)
      .join("");
    expect(readText).toContain("Hello from MCP test");

    await client.close();
  }, 30_000);
});
