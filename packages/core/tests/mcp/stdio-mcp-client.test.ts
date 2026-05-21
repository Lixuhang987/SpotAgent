import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { StdioMCPClient } from "../../src/mcp/StdioMCPClient.ts";

describe("StdioMCPClient", () => {
  it("lists and calls tools over newline-delimited json-rpc stdio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stdio-mcp-"));
    const serverPath = join(dir, "server.js");
    await writeFile(
      serverPath,
      `#!/usr/bin/env node
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const req = JSON.parse(line);
    if (req.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2025-11-25" } }) + "\\n");
    } else if (req.method === "tools/list") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] } }) + "\\n");
    } else if (req.method === "tools/call") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: req.params.arguments.text }] } }) + "\\n");
    }
  }
});
`,
      "utf8",
    );
    await chmod(serverPath, 0o755);

    const client = new StdioMCPClient({
      id: "echo",
      title: "Echo",
      transport: "stdio",
      command: serverPath,
    });

    await client.initialize();
    await expect(client.listTools()).resolves.toEqual([
      { name: "echo", description: "Echo", inputSchema: { type: "object" } },
    ]);
    await expect(client.callTool("echo", { text: "hello" })).resolves.toEqual({
      content: [{ type: "text", text: "hello" }],
    });
    await client.close();
  });
});
