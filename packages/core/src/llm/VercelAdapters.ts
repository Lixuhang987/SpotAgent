import { jsonSchema, tool, type JSONValue, type ModelMessage, type ToolSet } from "ai";
import type { BlobStore } from "../blob/BlobStore.ts";
import type { AgentImageContentPart, AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

// OpenAI 兼容网关要求 tool name 匹配 ^[a-zA-Z0-9_-]+$，
// 而仓内 tool 名字采用点号风格（如 file.read），需要在适配层做映射。
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export type VercelMessageAdapterOptions = {
  blobStore?: BlobStore;
};

export async function toVercelMessages(
  messages: AgentMessage[],
  options: VercelMessageAdapterOptions = {},
): Promise<ModelMessage[]> {
  return Promise.all(messages.map(async (message) => {
    switch (message.role) {
      case "user":
        return {
          role: "user",
          content: typeof message.content === "string"
            ? message.content
            : await Promise.all(message.content.map((part) => {
                if (part.type === "text") {
                  return Promise.resolve({
                    type: "text" as const,
                    text: part.text,
                  });
                }
                return toVercelImagePart(part, options);
              })),
        };
      case "assistant": {
        if (!message.toolCalls || message.toolCalls.length === 0) {
          return {
            role: "assistant",
            content: message.content,
          };
        }

        return {
          role: "assistant",
          content: [
            ...(message.content
              ? [
                  {
                    type: "text" as const,
                    text: message.content,
                  },
                ]
              : []),
            ...message.toolCalls.map((toolCall) => ({
              type: "tool-call" as const,
              toolCallId: toolCall.id,
              toolName: sanitizeToolName(toolCall.name),
              input: toolCall.arguments,
            })),
          ],
        };
      }
      case "tool":
        return {
          role: "tool",
          content: [
            {
              type: "tool-result" as const,
              toolCallId: message.toolCallId,
              toolName: sanitizeToolName(message.name),
              output: toToolResultOutput(message.content),
            },
          ],
        };
      case "system":
        return {
          role: "system",
          content: message.content,
        };
    }
  }));
}

export function hasImageContent(messages: AgentMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "user" &&
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image"),
  );
}

export function toVercelTools(tools: RegisteredTool[]): ToolSet {
  const sanitized = new Map<string, string>();
  return Object.fromEntries(
    tools.map((registeredTool) => {
      const safeName = sanitizeToolName(registeredTool.name);
      const collision = sanitized.get(safeName);
      if (collision && collision !== registeredTool.name) {
        throw new Error(
          `Tool name collision after sanitization: '${collision}' and '${registeredTool.name}' both map to '${safeName}'`
        );
      }
      sanitized.set(safeName, registeredTool.name);
      return [
        safeName,
        tool({
          description: registeredTool.description,
          inputSchema: jsonSchema(registeredTool.inputSchema as Parameters<typeof jsonSchema>[0]),
        }),
      ];
    })
  ) as ToolSet;
}

function toToolResultOutput(content: string) {
  try {
    return {
      type: "json" as const,
      value: JSON.parse(content) as JSONValue,
    };
  } catch {
    return {
      type: "text" as const,
      value: content,
    };
  }
}

async function toVercelImagePart(
  part: AgentImageContentPart,
  options: VercelMessageAdapterOptions,
) {
  if (!options.blobStore) {
    throw new Error("Image content requires a BlobStore.");
  }
  const record = await options.blobStore.get(part.blobId);
  if (!record) {
    throw new Error(`Image blob not found: ${part.blobId}`);
  }
  if (record.kind !== "image") {
    throw new Error(`Blob is not an image: ${part.blobId}`);
  }
  return {
    type: "image" as const,
    image: await options.blobStore.readContent(part.blobId),
    mediaType: part.mimeType,
  };
}
