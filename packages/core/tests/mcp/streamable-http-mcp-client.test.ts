import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { StreamableHttpMCPClient } from "../../src/mcp/StreamableHttpMCPClient.ts";

describe("StreamableHttpMCPClient", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  it("sends MCP protocol header and reads json-rpc responses", async () => {
    const server = createServer((req, res) => {
      expect(req.headers["mcp-protocol-version"]).toBe("2025-11-25");
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const rpc = JSON.parse(body);
        res.setHeader("content-type", "application/json");
        if (rpc.method === "tools/list") {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: rpc.id,
              result: {
                tools: [{ name: "echo", inputSchema: { type: "object" } }],
              },
            }),
          );
        } else if (rpc.method === "tools/call") {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: rpc.id,
              result: {
                content: [{ type: "text", text: rpc.params.arguments.text }],
              },
            }),
          );
        } else {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: {} }));
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("bad address");

    const client = new StreamableHttpMCPClient({
      id: "echo",
      title: "Echo",
      transport: "streamableHttp",
      url: `http://127.0.0.1:${address.port}/mcp`,
    });

    await client.initialize();
    await expect(client.listTools()).resolves.toEqual([
      { name: "echo", description: undefined, inputSchema: { type: "object" } },
    ]);
    await expect(client.callTool("echo", { text: "hello" })).resolves.toEqual({
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("parses event-stream json-rpc response data", async () => {
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const rpc = JSON.parse(body);
        res.setHeader("content-type", "text/event-stream");
        res.end(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { tools: [] },
          })}\n\n`,
        );
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("bad address");

    const client = new StreamableHttpMCPClient({
      id: "sse",
      title: "SSE",
      transport: "streamableHttp",
      url: `http://127.0.0.1:${address.port}/mcp`,
    });

    await expect(client.listTools()).resolves.toEqual([]);
  });
});
