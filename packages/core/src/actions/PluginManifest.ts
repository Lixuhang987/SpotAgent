export type PluginPromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type PluginPromptShortcut = {
  key: string;
  modifiers: string[];
};

export type PluginPromptKind = "plugin" | "skill";

export type PluginPrompt = {
  name: string;
  kind?: PluginPromptKind;
  trigger: string;
  title: string;
  description?: string;
  template: string;
  globalShortcut?: PluginPromptShortcut;
  arguments: PluginPromptArgument[];
};

export type ActionPluginManifest = {
  version: 1;
  id: string;
  title: string;
  description?: string;
  enabled?: boolean;
  mcpServerIds: string[];
  prompts: PluginPrompt[];
};

export function parsePluginManifest(value: unknown): ActionPluginManifest {
  if (!isRecord(value)) throw new Error("plugin manifest must be an object");
  if (value.version !== 1) throw new Error("plugin manifest version must be 1");

  const promptsValue = value.prompts;
  if (!Array.isArray(promptsValue) || promptsValue.length === 0) {
    throw new Error("plugin manifest prompts must be a non-empty array");
  }

  return {
    version: 1,
    id: requiredString(value, "id"),
    title: requiredString(value, "title"),
    description: optionalString(value, "description"),
    enabled: optionalBoolean(value, "enabled"),
    mcpServerIds: optionalStringArray(value, "mcpServerIds"),
    prompts: promptsValue.map(parsePrompt),
  };
}

function parsePrompt(value: unknown): PluginPrompt {
  if (!isRecord(value)) throw new Error("plugin prompt must be an object");

  return {
    name: requiredString(value, "name"),
    kind: optionalPromptKind(value, "kind"),
    trigger: requiredString(value, "trigger"),
    title: requiredString(value, "title"),
    description: optionalString(value, "description"),
    template: requiredString(value, "template"),
    globalShortcut: optionalShortcut(value, "globalShortcut"),
    arguments: Array.isArray(value.arguments) ? value.arguments.map(parseArgument) : [],
  };
}

function optionalPromptKind(
  record: Record<string, unknown>,
  key: string,
): PluginPromptKind | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value !== "plugin" && value !== "skill") {
    throw new Error(`plugin manifest ${key} must be "plugin" or "skill"`);
  }
  return value;
}

function optionalShortcut(
  record: Record<string, unknown>,
  key: string,
): PluginPromptShortcut | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`plugin manifest ${key} must be an object`);
  }
  return {
    key: requiredString(value, "key"),
    modifiers: optionalStringArray(value, "modifiers"),
  };
}

function parseArgument(value: unknown): PluginPromptArgument {
  if (!isRecord(value)) throw new Error("plugin prompt argument must be an object");

  return {
    name: requiredString(value, "name"),
    description: optionalString(value, "description"),
    required: optionalBoolean(value, "required"),
  };
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`plugin manifest ${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`plugin manifest ${key} must be a string`);
  }
  return value;
}

function optionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`plugin manifest ${key} must be a boolean`);
  }
  return value;
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`plugin manifest ${key} must be a string array`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
