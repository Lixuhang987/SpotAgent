import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { ToolCallEnvelope } from "../runtime/ToolCallEnvelope.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";
import type { BlobStore } from "../blob/BlobStore.ts";

export type LLMCompletion = {
  message: Extract<AgentMessage, { role: "assistant" }>;
  toolCalls?: ToolCallEnvelope[];
};

export type LLMStreamEvent =
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "tool_call";
      toolCall: ToolCallEnvelope;
    }
  | {
      type: "message_end";
      message: Extract<AgentMessage, { role: "assistant" }>;
      toolCalls?: ToolCallEnvelope[];
    };

export type LLMCompleteOptions = {
  blobStore?: BlobStore;
};

export interface LLMClient {
  stream(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): AsyncIterable<LLMStreamEvent>;

  complete?(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): Promise<LLMCompletion>;
}

export type LLMClientLike = LLMClient | LegacyLLMClient;

export async function completeLLM(
  client: LLMClientLike,
  messages: AgentMessage[],
  tools: RegisteredTool[],
  options?: LLMCompleteOptions,
): Promise<LLMCompletion> {
  if (client.complete) {
    return client.complete(messages, tools, options);
  }

  return collectLLMStream(client.stream(messages, tools, options));
}

export async function* streamLLM(
  client: LLMClientLike,
  messages: AgentMessage[],
  tools: RegisteredTool[],
  options?: LLMCompleteOptions,
): AsyncIterable<LLMStreamEvent> {
  if (client.stream) {
    yield* client.stream(messages, tools, options);
    return;
  }

  if (client.complete) {
    yield* streamFromCompletion(client.complete(messages, tools, options));
    return;
  }

  throw new Error("LLMClient must implement stream() or complete().");
}

export async function collectLLMStream(
  stream: AsyncIterable<LLMStreamEvent>,
): Promise<LLMCompletion> {
  let content = "";
  const toolCalls: ToolCallEnvelope[] = [];
  let finalMessage: Extract<AgentMessage, { role: "assistant" }> | undefined;
  let finalToolCalls: ToolCallEnvelope[] | undefined;

  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
        content += event.text;
        break;
      case "tool_call":
        toolCalls.push(event.toolCall);
        break;
      case "message_end":
        finalMessage = event.message;
        finalToolCalls = event.toolCalls;
        break;
    }
  }

  return {
    message: finalMessage ?? { role: "assistant", content },
    toolCalls: finalToolCalls ?? toolCalls,
  };
}

export type LegacyLLMClient = {
  stream?: LLMClient["stream"];
  complete?: LLMClient["complete"];
};

async function* streamFromCompletion(
  completionPromise: Promise<LLMCompletion>,
): AsyncIterable<LLMStreamEvent> {
  const completion = await completionPromise;

  if (completion.message.content) {
    yield {
      type: "text_delta",
      text: completion.message.content,
    };
  }

  for (const toolCall of completion.toolCalls ?? []) {
    yield {
      type: "tool_call",
      toolCall,
    };
  }

  yield {
    type: "message_end",
    message: completion.message,
    toolCalls: completion.toolCalls,
  };
}
