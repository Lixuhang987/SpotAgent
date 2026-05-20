import type { AgentMessage } from "./AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

export type SystemPromptContext = {
  tools: RegisteredTool[];
};

export type SystemPromptSection = {
  name: string;
  resolve: (context: SystemPromptContext) => string | null | Promise<string | null>;
};

export function systemPromptSection(
  name: string,
  resolve: SystemPromptSection["resolve"],
): SystemPromptSection {
  return { name, resolve };
}

export async function resolveSystemPromptSections(
  sections: SystemPromptSection[],
  context: SystemPromptContext,
): Promise<string[]> {
  const resolved = await Promise.all(sections.map((section) => section.resolve(context)));
  return resolved.filter(isNonEmptyPromptSection);
}

export async function buildSystemPromptMessages(input: {
  sections: SystemPromptSection[];
  context: SystemPromptContext;
  messages: AgentMessage[];
}): Promise<AgentMessage[]> {
  const promptSections = await resolveSystemPromptSections(input.sections, input.context);
  if (promptSections.length === 0) return input.messages;

  return [
    ...promptSections.map((content): AgentMessage => ({ role: "system", content })),
    ...input.messages,
  ];
}

export function buildDefaultSystemPromptSections(): SystemPromptSection[] {
  return [buildToolUsePolicySection()];
}

export function buildToolUsePolicySection(): SystemPromptSection {
  return systemPromptSection("tool-use-policy", ({ tools }) => {
    if (tools.length === 0) return null;
    return TOOL_USE_POLICY_PROMPT;
  });
}

export const TOOL_USE_POLICY_PROMPT =
  "Tool-use policy: available tools are provided separately by the runtime. " +
  "When the user asks you to use tools, call tools, read external state, inspect the app, or execute a multi-step workflow that requires tools, emit structured tool calls instead of only describing planned tool calls in assistant text. " +
  "When multiple tools are needed, emit all required tool calls in the same assistant response when possible. " +
  "After tool results are returned, summarize the results for the user.";

function isNonEmptyPromptSection(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
