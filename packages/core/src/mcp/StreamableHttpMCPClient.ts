import type {
  MCPCallToolResult,
  MCPClient,
  MCPGetPromptResult,
  MCPPromptDescription,
  MCPReadResourceResult,
  MCPResourceDescription,
  MCPServerCapabilities,
  MCPServerInfo,
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
  private info?: MCPServerInfo;
  private sessionId?: string;

  constructor(private readonly config: HttpServerConfig) {}

  async initialize(): Promise<MCPServerInfo> {
    const { result, sessionId } = await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "handagent", version: "0.1.0" },
    });
    if (sessionId) this.sessionId = sessionId;
    const r = isRecord(result) ? result : {};
    const serverInfo = isRecord(r.serverInfo) ? r.serverInfo : {};
    this.info = {
      name: typeof serverInfo.name === "string" ? serverInfo.name : "unknown",
      version: typeof serverInfo.version === "string" ? serverInfo.version : "unknown",
      protocolVersion: typeof r.protocolVersion === "string" ? r.protocolVersion : "2025-11-25",
      capabilities: isRecord(r.capabilities) ? (r.capabilities as MCPServerCapabilities) : {},
    };
    await this.notify("notifications/initialized", {});
    return this.info;
  }

  serverInfo(): MCPServerInfo | undefined {
    return this.info;
  }

  // --- Tools ---

  async listTools(): Promise<MCPToolDescription[]> {
    const { result } = await this.request("tools/list", {});
    if (!isRecord(result) || !Array.isArray(result.tools)) return [];
    return result.tools.map(parseToolDescription);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallToolResult> {
    const { result } = await this.request("tools/call", { name, arguments: args });
    return isRecord(result) ? (result as MCPCallToolResult) : { content: [] };
  }

  // --- Prompts ---

  async listPrompts(): Promise<MCPPromptDescription[]> {
    const { result } = await this.request("prompts/list", {});
    if (!isRecord(result) || !Array.isArray(result.prompts)) return [];
    return result.prompts.map(parsePromptDescription);
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<MCPGetPromptResult> {
    const params: Record<string, unknown> = { name };
    if (args) params.arguments = args;
    const { result } = await this.request("prompts/get", params);
    if (!isRecord(result)) return { messages: [] };
    return {
      description: typeof result.description === "string" ? result.description : undefined,
      messages: Array.isArray(result.messages) ? result.messages : [],
    } as MCPGetPromptResult;
  }

  // --- Resources ---

  async listResources(): Promise<MCPResourceDescription[]> {
    const { result } = await this.request("resources/list", {});
    if (!isRecord(result) || !Array.isArray(result.resources)) return [];
    return result.resources.map(parseResourceDescription);
  }

  async readResource(uri: string): Promise<MCPReadResourceResult> {
    const { result } = await this.request("resources/read", { uri });
    if (!isRecord(result) || !Array.isArray(result.contents)) {
      return { contents: [] };
    }
    return { contents: result.contents } as MCPReadResourceResult;
  }

  // --- Lifecycle ---

  async close(): Promise<void> {}

  // --- Transport ---

  private async request(
    method: string,
    params: unknown,
  ): Promise<{ result: unknown; sessionId?: string }> {
    const id = this.nextId++;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      ...(this.config.headers ?? {}),
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.config.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) {
      throw new Error(`MCP HTTP request failed: ${response.status}`);
    }

    const returnedSessionId = response.headers.get("Mcp-Session-Id") ?? undefined;
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const rpc = contentType.includes("text/event-stream")
      ? parseEventStreamResponse(text, id)
      : (JSON.parse(text) as JsonRpcResponse);
    if (rpc.error) {
      throw new Error(rpc.error.message ?? "MCP HTTP request failed");
    }
    return { result: rpc.result, sessionId: returnedSessionId };
  }

  private async notify(method: string, params: unknown): Promise<void> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
      ...(this.config.headers ?? {}),
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    await fetch(this.config.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    });
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

function parsePromptDescription(value: unknown): MCPPromptDescription {
  if (!isRecord(value) || typeof value.name !== "string") {
    throw new Error("Invalid MCP prompt description");
  }
  return {
    name: value.name,
    title: typeof value.title === "string" ? value.title : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    arguments: Array.isArray(value.arguments) ? value.arguments : undefined,
  };
}

function parseResourceDescription(value: unknown): MCPResourceDescription {
  if (!isRecord(value) || typeof value.uri !== "string" || typeof value.name !== "string") {
    throw new Error("Invalid MCP resource description");
  }
  return {
    uri: value.uri,
    name: value.name,
    title: typeof value.title === "string" ? value.title : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
