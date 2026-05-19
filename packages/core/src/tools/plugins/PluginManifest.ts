export type PluginWorkspacePermission = "read" | "write";

export type PluginToolManifest = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  command: string;
  timeoutMs?: number;
  permissions?: {
    workspace?: PluginWorkspacePermission;
    [key: string]: unknown;
  };
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  tools: PluginToolManifest[];
  enabled?: boolean;
};

export function parsePluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) throw new Error("plugin manifest must be an object");
  const id = requiredString(value, "id");
  const name = requiredString(value, "name");
  const version = requiredString(value, "version");
  const enabled = optionalBoolean(value, "enabled");
  const rawTools = value.tools;
  if (!Array.isArray(rawTools) || rawTools.length === 0) {
    throw new Error("plugin manifest tools must be a non-empty array");
  }

  return {
    id,
    name,
    version,
    enabled,
    tools: rawTools.map((tool, index) => parseToolManifest(tool, index)),
  };
}

function parseToolManifest(value: unknown, index: number): PluginToolManifest {
  if (!isRecord(value)) throw new Error(`tool[${index}] must be an object`);
  const name = requiredString(value, "name");
  const description = requiredString(value, "description");
  const command = requiredString(value, "command");
  if (!isRecord(value.inputSchema)) {
    throw new Error(`tool[${index}].inputSchema must be an object`);
  }
  if (value.timeoutMs !== undefined && !isPositiveInteger(value.timeoutMs)) {
    throw new Error(`tool[${index}].timeoutMs must be a positive integer`);
  }

  const permissions = value.permissions;
  if (permissions !== undefined && !isRecord(permissions)) {
    throw new Error(`tool[${index}].permissions must be an object`);
  }
  if (
    isRecord(permissions) &&
    permissions.workspace !== undefined &&
    permissions.workspace !== "read" &&
    permissions.workspace !== "write"
  ) {
    throw new Error(`tool[${index}].permissions.workspace must be read or write`);
  }

  return {
    name,
    description,
    inputSchema: value.inputSchema,
    command,
    timeoutMs: value.timeoutMs,
    permissions: permissions as PluginToolManifest["permissions"],
  };
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`plugin manifest ${key} must be a non-empty string`);
  }
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`plugin manifest ${key} must be a boolean`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}
