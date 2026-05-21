import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { StdioMCPClient } from "../../src/mcp/StdioMCPClient.ts";

const SERVER_SCRIPT = `#!/usr/bin/env node
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
    if (!req.id) continue; // skip notifications
    if (req.method === "initialize") {
      respond(req.id, {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: "test-server", version: "1.0.0" },
      });
    } else if (req.method === "tools/list") {
      respond(req.id, {
        tools: [
          { name: "echo", description: "Echo input text", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
        ],
      });
    } else if (req.method === "tools/call") {
      respond(req.id, {
        content: [{ type: "text", text: req.params.arguments.text }],
      });
    } else if (req.method === "prompts/list") {
      respond(req.id, {
        prompts: [
          { name: "summarize", title: "Summarize Text", description: "Summarize the given text", arguments: [{ name: "text", description: "Text to summarize", required: true }] },
        ],
      });
    } else if (req.method === "prompts/get") {
      respond(req.id, {
        description: "Summarize the given text",
        messages: [
          { role: "user", content: { type: "text", text: "Please summarize: " + (req.params.arguments?.text ?? "") } },
        ],
      });
    } else if (req.method === "resources/list") {
      respond(req.id, {
        resources: [
          { uri: "file:///notes.txt", name: "notes.txt", mimeType: "text/plain", description: "User notes" },
        ],
      });
    } else if (req.method === "resources/read") {
      respond(req.id, {
        contents: [{ uri: req.params.uri, text: "Hello from resource", mimeType: "text/plain" }],
      });
    } else {
      respond(req.id, null, { code: -32601, message: "Method not found" });
    }
  }
});

function respond(id, result, error) {
  const msg = { jsonrpc: "2.0", id };
  if (error) msg.error = error;
  else msg.result = result;
  process.stdout.write(JSON.stringify(msg) + "\\n");
}
`;

describe("StdioMCPClient (full protocol)", () => {
  it("initializes and reports server capabilities", async () => {
    const client = await createTestClient();
    const info = await client.initialize();
    expect(info.name).toBe("test-server");
    expect(info.capabilities.tools).toBeDefined();
    expect(info.capabilities.prompts).toBeDefined();
    expect(info.capabilities.resources).toBeDefined();
    expect(client.serverInfo()).toEqual(info);
    await client.close();
  });

  it("lists and calls tools", async () => {
    const client = await createTestClient();
    await client.initialize();

    const tools = await client.listTools();
    expect(tools).toEqual([
      { name: "echo", description: "Echo input text", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
    ]);

    const result = await client.callTool("echo", { text: "hello mcp" });
    expect(result.content).toEqual([{ type: "text", text: "hello mcp" }]);
    await client.close();
  });

  it("lists and gets prompts", async () => {
    const client = await createTestClient();
    await client.initialize();

    const prompts = await client.listPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe("summarize");
    expect(prompts[0].arguments).toHaveLength(1);

    const result = await client.getPrompt("summarize", { text: "some content" });
    expect(result.description).toBe("Summarize the given text");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("some content");
    await client.close();
  });

  it("lists and reads resources", async () => {
    const client = await createTestClient();
    await client.initialize();

    const resources = await client.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe("file:///notes.txt");
    expect(resources[0].mimeType).toBe("text/plain");

    const result = await client.readResource("file:///notes.txt");
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toBe("Hello from resource");
    await client.close();
  });
});

async function createTestClient(): Promise<StdioMCPClient> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-full-"));
  const serverPath = join(dir, "server.js");
  await writeFile(serverPath, SERVER_SCRIPT, "utf8");
  await chmod(serverPath, 0o755);
  return new StdioMCPClient({
    id: "test",
    title: "Test Server",
    transport: "stdio",
    command: serverPath,
  });
}
