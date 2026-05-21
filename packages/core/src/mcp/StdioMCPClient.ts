import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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

type StdioServerConfig = Extract<MCPServerConfig, { transport: "stdio" }>;

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};

export class StdioMCPClient implements MCPClient {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private buffer = "";
  private info?: MCPServerInfo;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(private readonly config: StdioServerConfig) {}

  async initialize(): Promise<MCPServerInfo> {
    const result = await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: this.clientCapabilities(),
      clientInfo: { name: "handagent", version: "0.1.0" },
    });
    const r = isRecord(result) ? result : {};
    const serverInfo = isRecord(r.serverInfo) ? r.serverInfo : {};
    this.info = {
      name: typeof serverInfo.name === "string" ? serverInfo.name : this.config.id,
      version: typeof serverInfo.version === "string" ? serverInfo.version : "unknown",
      protocolVersion: typeof r.protocolVersion === "string" ? r.protocolVersion : "2025-11-25",
      capabilities: isRecord(r.capabilities) ? (r.capabilities as MCPServerCapabilities) : {},
    };
    this.sendNotification("notifications/initialized", {});
    return this.info;
  }

  serverInfo(): MCPServerInfo | undefined {
    return this.info;
  }

  // --- Tools ---

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

  // --- Prompts ---

  async listPrompts(): Promise<MCPPromptDescription[]> {
    const result = await this.request("prompts/list", {});
    if (!isRecord(result) || !Array.isArray(result.prompts)) return [];
    return result.prompts.map(parsePromptDescription);
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<MCPGetPromptResult> {
    const params: Record<string, unknown> = { name };
    if (args) params.arguments = args;
    const result = await this.request("prompts/get", params);
    if (!isRecord(result)) return { messages: [] };
    return {
      description: typeof result.description === "string" ? result.description : undefined,
      messages: Array.isArray(result.messages) ? result.messages : [],
    } as MCPGetPromptResult;
  }

  // --- Resources ---

  async listResources(): Promise<MCPResourceDescription[]> {
    const result = await this.request("resources/list", {});
    if (!isRecord(result) || !Array.isArray(result.resources)) return [];
    return result.resources.map(parseResourceDescription);
  }

  async readResource(uri: string): Promise<MCPReadResourceResult> {
    const result = await this.request("resources/read", { uri });
    if (!isRecord(result) || !Array.isArray(result.contents)) {
      return { contents: [] };
    }
    return { contents: result.contents } as MCPReadResourceResult;
  }

  // --- Lifecycle ---

  async close(): Promise<void> {
    this.child?.kill("SIGTERM");
    this.child = undefined;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("MCP stdio client closed"));
    }
    this.pending.clear();
  }

  // --- Transport ---

  private clientCapabilities(): Record<string, unknown> {
    return this.config.elicitation?.autoAcceptEmptyForm === true
      ? { elicitation: { form: {} } }
      : {};
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const child = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...(this.config.env ?? {}) },
      cwd: this.config.cwd,
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
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `MCP stdio request timed out after ${this.requestTimeoutMs()}ms: ${method}`,
          ),
        );
      }, this.requestTimeoutMs());
      this.pending.set(id, { resolve, reject, timeout });
    });
    child.stdin.write(payload);
    return promise;
  }

  private requestTimeoutMs(): number {
    return this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private sendNotification(method: string, params: unknown): void {
    const child = this.ensureChild();
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    child.stdin.write(payload);
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line) as JsonRpcMessage;
      if (message.method) {
        this.handleServerRequest(message);
      } else if (message.id !== undefined) {
        this.handleResponse(message);
      }
    }
  }

  private handleResponse(response: JsonRpcMessage): void {
    if (typeof response.id !== "number") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    clearTimeout(pending.timeout);
    if (response.error) {
      pending.reject(new Error(response.error.message ?? "MCP stdio request failed"));
      return;
    }
    pending.resolve(response.result);
  }

  private handleServerRequest(request: JsonRpcMessage): void {
    if (request.id === undefined) return;
    if (request.method === "elicitation/create") {
      const canAccept =
        this.config.elicitation?.autoAcceptEmptyForm === true &&
        isEmptyFormElicitation(request.params);
      this.sendResponse(request.id, canAccept
        ? { action: "accept", content: {} }
        : { action: "decline" });
    }
  }

  private sendResponse(id: number | string, result: unknown): void {
    const child = this.ensureChild();
    const payload = JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
    child.stdin.write(payload);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
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

function isEmptyFormElicitation(params: unknown): boolean {
  if (!isRecord(params) || !isRecord(params.requestedSchema)) return false;
  const schema = params.requestedSchema;
  if (schema.type !== "object") return false;
  if (Array.isArray(schema.required) && schema.required.length > 0) return false;
  return !isRecord(schema.properties) || Object.keys(schema.properties).length === 0;
}
