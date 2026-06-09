import { jsonSchema, tool, type JSONValue, type ModelMessage, type ToolSet } from "ai";
import type { BlobStore } from "../blob/BlobStore.ts";
import type { AgentImageContentPart, AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

// OpenAI 兼容网关要求 tool name 匹配 ^[a-zA-Z0-9_-]+$，
// 而仓内 tool 名字采用点号风格（如 file.read），需要在适配层做映射。
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createOpenAICompatibleFetch(baseFetch?: typeof fetch): typeof fetch {
  const fetchImpl = baseFetch ?? globalThis.fetch;
  return async function openAICompatibleFetch(input, init) {
    const response = await fetchImpl(input, init);
    if (!isEventStreamResponse(response) || !response.body) {
      return response;
    }

    return new Response(filterEmptySSEDataEventStream(response.body), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

export function filterEmptySSEDataEvents(raw: string): string {
  const trailingLineBreak = raw.match(/(\r?\n)$/)?.[0] ?? "";
  const blocks = raw.split(/\r?\n\r?\n/);
  const filteredBlocks: string[] = [];
  let pendingEventLines: string[] = [];

  for (const [index, block] of blocks.entries()) {
    if (block === "" && index === blocks.length - 1) {
      if (trailingLineBreak.length > 0) {
        filteredBlocks.push(block);
      }
      continue;
    }

    const lines = block.split(/\r?\n/);
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    const hasOnlyEmptyData = dataLines.length > 0 && dataLines.every(isEmptySSEDataLine);
    if (hasOnlyEmptyData) {
      pendingEventLines = lines.filter((line) => !line.startsWith("data:"));
      continue;
    }

    if (pendingEventLines.length > 0 && dataLines.length > 0 && !lines.some(isSSEEventLine)) {
      filteredBlocks.push([...pendingEventLines, ...lines].join("\n"));
      pendingEventLines = [];
      continue;
    }

    pendingEventLines = [];
    filteredBlocks.push(block);
  }

  return filteredBlocks.join("\n\n");
}

function filterEmptySSEDataEventStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";

  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lastLineBreak = Math.max(pending.lastIndexOf("\n"), pending.lastIndexOf("\r"));
      if (lastLineBreak === -1) {
        return;
      }
      const complete = pending.slice(0, lastLineBreak + 1);
      pending = pending.slice(lastLineBreak + 1);
      const filtered = filterEmptySSEDataEvents(complete);
      if (filtered) {
        controller.enqueue(encoder.encode(filtered));
      }
    },
    flush(controller) {
      const finalText = pending + decoder.decode();
      const filtered = filterEmptySSEDataEvents(finalText);
      if (filtered) {
        controller.enqueue(encoder.encode(filtered));
      }
    },
  }));
}

function isEventStreamResponse(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().split(";")[0].trim() === "text/event-stream";
}

function isEmptySSEDataLine(line: string): boolean {
  return /^data:\s*$/.test(line);
}

function isSSEEventLine(line: string): boolean {
  return line.startsWith("event:");
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
