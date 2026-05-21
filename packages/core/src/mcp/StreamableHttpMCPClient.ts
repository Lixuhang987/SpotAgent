import type {
  MCPCallToolResult,
  MCPClient,
  MCPToolDescription,
} from "./MCPClient.ts";
import type { MCPServerConfig } from "./MCPConfig.ts";

type HttpServerConfig = Extract<MCPServerConfig, { transport: "streamableHttp" }>;

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { message?: string };
};

export class StreamableHttpMCPClient implements MCPClient {
  private nextId = 1;

  constructor(private readonly config: HttpServerConfig) {}

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "handagent", version: "0.1.0" },
    });
  }

  async listTools(): Promise<MCPToolDescription[]> {
    const result = await this.request("tools/list", {});
    if (!isRecord(result) || !Array.isArray(result.tools)) return [];
    return result.tools.map(parseToolDescription);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallToolResult> {
    const result = await this.request("tools/call", { name, arguments: args });
    return isRecord(result) ? (result as MCPCallToolResult) : { content: [] };
  }

  async close(): Promise<void> {}

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const response = await fetch(this.config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
        ...(this.config.headers ?? {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) {
      throw new Error(`MCP HTTP request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const rpc = contentType.includes("text/event-stream")
      ? parseEventStreamResponse(text, id)
      : (JSON.parse(text) as JsonRpcResponse);
    if (rpc.error) {
      throw new Error(rpc.error.message ?? "MCP HTTP request failed");
    }
    return rpc.result;
  }
}

function parseEventStreamResponse(text: string, id: number): JsonRpcResponse {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const parsed = JSON.parse(line.slice("data:".length).trim()) as JsonRpcResponse;
    if (parsed.id === id) return parsed;
  }
  throw new Error("MCP HTTP event stream did not contain response");
}

function parseToolDescription(value: unknown): MCPToolDescription {
  if (!isRecord(value) || typeof value.name !== "string") {
    throw new Error("Invalid MCP tool description");
  }
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : undefined,
    inputSchema: isRecord(value.inputSchema) ? value.inputSchema : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
