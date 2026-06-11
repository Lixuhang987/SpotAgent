export type StdioMCPServerConfig = {
  id: string;
  title: string;
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  requestTimeoutMs?: number;
  elicitation?: MCPElicitationConfig;
};

export type StreamableHttpMCPServerConfig = {
  id: string;
  title: string;
  transport: "streamableHttp";
  url: string;
  headers?: Record<string, string>;
};

export type MCPServerConfig =
  | StdioMCPServerConfig
  | StreamableHttpMCPServerConfig;

export type MCPConfig = {
  version: 1;
  servers: MCPServerConfig[];
};

export type MCPElicitationConfig = {
  autoAcceptEmptyForm?: boolean;
};

export function parseMCPConfig(value: unknown): MCPConfig {
  if (!isRecord(value)) throw new Error("mcp config must be an object");
  if (value.version !== 1) throw new Error("mcp config version must be 1");
  if (!Array.isArray(value.servers)) {
    throw new Error("mcp config servers must be an array");
  }

  return {
    version: 1,
    servers: value.servers.map(parseServer),
  };
}

function parseServer(value: unknown): MCPServerConfig {
  if (!isRecord(value)) throw new Error("mcp server must be an object");

  const id = requiredString(value, "id");
  const title = requiredString(value, "title");
  if (value.transport === "stdio") {
    return {
      id,
      title,
      transport: "stdio",
      command: requiredString(value, "command"),
      args: stringArray(value.args),
      env: isRecord(value.env) ? stringRecord(value.env, "env") : undefined,
      cwd: optionalString(value, "cwd"),
      requestTimeoutMs: optionalPositiveInteger(value, "requestTimeoutMs"),
      elicitation: parseElicitation(value.elicitation),
    };
  }
  if (value.transport === "streamableHttp") {
    return {
      id,
      title,
      transport: "streamableHttp",
      url: requiredString(value, "url"),
      headers: isRecord(value.headers)
        ? interpolateHeaders(stringRecord(value.headers, "headers"))
        : undefined,
    };
  }

  throw new Error("mcp server transport must be stdio or streamableHttp");
}

function interpolateHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_, name: string) => process.env[name] ?? "",
    );
  }
  return result;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`mcp ${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`mcp ${key} must be a non-empty string`);
  }
  return value;
}

function optionalPositiveInteger(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`mcp ${key} must be a positive integer`);
  }
  return value;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("mcp args must be a string array");
  }
  return value;
}

function stringRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, string> {
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "string")) {
    throw new Error(`mcp ${key} must be a string record`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function parseElicitation(value: unknown): MCPElicitationConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("mcp elicitation must be an object");
  if (
    value.autoAcceptEmptyForm !== undefined &&
    typeof value.autoAcceptEmptyForm !== "boolean"
  ) {
    throw new Error("mcp elicitation autoAcceptEmptyForm must be a boolean");
  }
  return {
    autoAcceptEmptyForm: value.autoAcceptEmptyForm,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
