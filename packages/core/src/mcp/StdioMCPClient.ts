import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  MCPCallToolResult,
  MCPClient,
  MCPToolDescription,
} from "./MCPClient.ts";
import type { MCPServerConfig } from "./MCPConfig.ts";

type StdioServerConfig = Extract<MCPServerConfig, { transport: "stdio" }>;

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { message?: string };
};

export class StdioMCPClient implements MCPClient {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(private readonly config: StdioServerConfig) {}

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

  async close(): Promise<void> {
    this.child?.kill("SIGTERM");
    this.child = undefined;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("MCP stdio client closed"));
    }
    this.pending.clear();
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const child = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleData(chunk));
    child.on("error", (error) => this.rejectAll(error));
    child.on("close", () => this.rejectAll(new Error("MCP stdio server closed")));
    this.child = child;
    return child;
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.ensureChild();
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    child.stdin.write(payload);
    return promise;
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      this.handleResponse(JSON.parse(line) as JsonRpcResponse);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message ?? "MCP stdio request failed"));
      return;
    }
    pending.resolve(response.result);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
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
