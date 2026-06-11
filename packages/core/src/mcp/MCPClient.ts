export type MCPToolDescription = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type MCPCallToolResult = {
  content?: MCPContent[];
  isError?: boolean;
  [key: string]: unknown;
};

export type MCPTextContent = { type: "text"; text: string };
export type MCPImageContent = { type: "image"; data: string; mimeType: string };
export type MCPResourceContent = { type: "resource"; resource: { uri: string; text?: string; blob?: string; mimeType?: string } };

export type MCPContent =
  | MCPTextContent
  | MCPImageContent
  | MCPResourceContent;

export type MCPPromptDescription = {
  name: string;
  title?: string;
  description?: string;
  arguments?: MCPPromptArgument[];
};

export type MCPPromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type MCPPromptMessage = {
  role: "user" | "assistant";
  content: MCPContent;
};

export type MCPGetPromptResult = {
  description?: string;
  messages: MCPPromptMessage[];
};

export type MCPResourceDescription = {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
};

export type MCPReadResourceResult = {
  contents: MCPResourceContent[];
};

export type MCPResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

export type MCPServerCapabilities = {
  tools?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
};

export type MCPServerInfo = {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
};

export interface MCPClient {
  initialize(): Promise<MCPServerInfo>;
  serverInfo(): MCPServerInfo | undefined;

  listTools(): Promise<MCPToolDescription[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult>;

  listPrompts(): Promise<MCPPromptDescription[]>;
  getPrompt(name: string, args?: Record<string, string>): Promise<MCPGetPromptResult>;

  listResources(): Promise<MCPResourceDescription[]>;
  readResource(uri: string): Promise<MCPReadResourceResult>;

  close(): Promise<void>;
}
