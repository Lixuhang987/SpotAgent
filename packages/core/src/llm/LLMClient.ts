import type { AgentMessage, AssistantAgentMessage } from "../runtime/AgentMessage.ts";
import type { ToolCallEnvelope } from "../runtime/ToolCallEnvelope.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";
import type { BlobStore } from "../blob/BlobStore.ts";

export type LLMCompletion = {
  message: AssistantAgentMessage;
  toolCalls?: ToolCallEnvelope[];
};

export type TextDeltaStreamEvent = {
  type: "text_delta";
  text: string;
};

export type ToolCallStreamEvent = {
  type: "tool_call";
  toolCall: ToolCallEnvelope;
};

export type MessageEndStreamEvent = {
  type: "message_end";
  message: AssistantAgentMessage;
  toolCalls?: ToolCallEnvelope[];
};

export type LLMStreamEvent =
  | TextDeltaStreamEvent
  | ToolCallStreamEvent
  | MessageEndStreamEvent;

export type LLMCompleteOptions = {
  blobStore?: BlobStore;
  signal?: AbortSignal;
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
  throwIfAborted(options?.signal);
  if (client.complete) {
    const completion = await client.complete(messages, tools, options);
    throwIfAborted(options?.signal);
    return completion;
  }

  return collectLLMStream(client.stream(messages, tools, options));
}

export async function* streamLLM(
  client: LLMClientLike,
  messages: AgentMessage[],
  tools: RegisteredTool[],
  options?: LLMCompleteOptions,
): AsyncIterable<LLMStreamEvent> {
  throwIfAborted(options?.signal);
  if (client.stream) {
    for await (const event of client.stream(messages, tools, options)) {
      throwIfAborted(options?.signal);
      yield event;
    }
    return;
  }

  if (client.complete) {
    yield* streamFromCompletion(client.complete(messages, tools, options), options?.signal);
    return;
  }

  throw new Error("LLMClient must implement stream() or complete().");
}

export async function collectLLMStream(
  stream: AsyncIterable<LLMStreamEvent>,
): Promise<LLMCompletion> {
  let content = "";
  const toolCalls: ToolCallEnvelope[] = [];
  let finalMessage: AssistantAgentMessage | undefined;
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
  signal?: AbortSignal,
): AsyncIterable<LLMStreamEvent> {
  throwIfAborted(signal);
  const completion = await completionPromise;
  throwIfAborted(signal);

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

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createAbortError();
}

export function createAbortError(): Error {
  const error = new Error("The agent run was interrupted.");
  error.name = "AbortError";
  return error;
}
