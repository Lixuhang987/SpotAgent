export type MCPToolDescription = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type MCPCallToolResult = {
  content?: unknown[];
  isError?: boolean;
  [key: string]: unknown;
};

export interface MCPClient {
  initialize(): Promise<void>;
  listTools(): Promise<MCPToolDescription[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult>;
  close(): Promise<void>;
}
