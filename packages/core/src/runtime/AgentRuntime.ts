import type { AgentMessage } from "./AgentMessage.ts";
import type { ToolCallEnvelope } from "./ToolCallEnvelope.ts";
import type { LLMClientLike } from "../llm/LLMClient.ts";
import type { LLMCompletion } from "../llm/LLMClient.ts";
import { streamLLM, throwIfAborted } from "../llm/LLMClient.ts";
import { ToolRegistry } from "../tools/ToolRegistry.ts";
import type { PermissionPolicy } from "../permission/PermissionPolicy.ts";
import { AllowAllPermissionPolicy, DENY_TOOL_RESULT_TEXT } from "../permission/PermissionPolicy.ts";
import type { BlobStore } from "../blob/BlobStore.ts";
import { renderStub, type StubCacheScope } from "./Stub.ts";
import type { TurnSummarizerLike } from "./TurnSummarizer.ts";
import {
  buildDefaultSystemPromptSections,
  buildSystemPromptMessages,
  type SystemPromptSection,
} from "./SystemPrompt.ts";

export type AgentBubble = {
  id: string;
  text: string;
};

export type AgentRunResult = {
  messages: AgentMessage[];
  bubbles: AgentBubble[];
};

export type AgentRuntimeEvent =
  | {
      type: "assistant_message_start";
      messageId: string;
      payload: { role: "assistant" };
    }
  | {
      type: "assistant_message_delta";
      messageId: string;
      payload: { text: string };
    }
  | {
      type: "assistant_message_end";
      messageId: string;
      payload: { status: "completed" | "interrupted" };
    }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      toolName: string;
      status: "success" | "error";
      output: string;
      durationMs: number;
    }
  | {
      type: "permission_decision";
      toolCallId: string;
      toolName: string;
      decision: "allow" | "deny";
      scope?: "once" | "session" | "always";
      reason?: string;
    }
  | {
      type: "runtime_error";
      message: string;
      code?: string;
    };

export type AgentRuntimeRunOptions = {
  sessionId?: string;
  signal?: AbortSignal;
};

export class AgentRuntime {
  private readonly maxTurns: number;
  private readonly permissionPolicy: PermissionPolicy;
  private readonly blobStore?: BlobStore;
  private readonly turnSummarizer?: TurnSummarizerLike;
  private readonly systemPromptSections: SystemPromptSection[];
  private pendingTurnSummary: Promise<void> = Promise.resolve();

  constructor(
    private readonly client: LLMClientLike,
    private readonly toolRegistry: ToolRegistry,
    options?: {
      maxTurns?: number;
      permissionPolicy?: PermissionPolicy;
      blobStore?: BlobStore;
      turnSummarizer?: TurnSummarizerLike;
      systemPromptSections?: SystemPromptSection[];
    }
  ) {
    this.maxTurns = options?.maxTurns ?? 8;
    this.permissionPolicy = options?.permissionPolicy ?? new AllowAllPermissionPolicy();
    this.blobStore = options?.blobStore;
    this.turnSummarizer = options?.turnSummarizer;
    this.systemPromptSections = options?.systemPromptSections ?? buildDefaultSystemPromptSections();
  }

  async run(userInput: string): Promise<AgentRunResult> {
    return this.runWithMessages([
      {
        role: "user",
        content: userInput,
      },
    ]);
  }

  async runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void = () => {},
    runOptions: AgentRuntimeRunOptions = {}
  ): Promise<AgentRunResult> {
    const nextMessages = [...messages];
    throwIfAborted(runOptions.signal);
    await this.waitForPendingSummaries(nextMessages);
    throwIfAborted(runOptions.signal);
    const bubbles: AgentBubble[] = [];
    let assistantCount = 0;

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const completion = await this.completeTurn(nextMessages, onEvent, ++assistantCount, runOptions);
      throwIfAborted(runOptions.signal);
      const assistantMessage =
        completion.toolCalls && completion.toolCalls.length > 0
          ? {
              ...completion.message,
              toolCalls: completion.toolCalls,
            }
          : completion.message;

      nextMessages.push(assistantMessage);
      if (assistantMessage.role === "assistant") {
        bubbles.push({
          id: `assistant-${assistantCount}`,
          text: assistantMessage.content,
        });
      }

      const toolCalls = completion.toolCalls ?? [];
      if (toolCalls.length === 0) {
        this.startTurnSummary(nextMessages);
        return {
          messages: nextMessages,
          bubbles,
        };
      }

      for (const toolCall of toolCalls) {
        throwIfAborted(runOptions.signal);
        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool) {
          throw new Error(`Unknown tool: ${toolCall.name}`);
        }

        const permRequest = {
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          sessionId: runOptions.sessionId,
          toolCallId: toolCall.id,
        };

        let decision = await this.permissionPolicy.check(permRequest);
        throwIfAborted(runOptions.signal);
        if (decision === "ask") {
          const resolution = await this.permissionPolicy.resolveAsk(permRequest);
          throwIfAborted(runOptions.signal);
          await this.permissionPolicy.remember(permRequest, resolution);
          decision = resolution.decision;
          onEvent({
            type: "permission_decision",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            decision: resolution.decision,
            scope: resolution.remember,
            reason: resolution.decision === "deny" ? resolution.reason : undefined,
          });
        }

        if (decision === "deny") {
          nextMessages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: DENY_TOOL_RESULT_TEXT,
          });
          onEvent({
            type: "tool_result",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            status: "error",
            output: DENY_TOOL_RESULT_TEXT,
            durationMs: 0,
          });
          continue;
        }

        onEvent({
          type: "tool_call",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.arguments,
        });

        const startedAt = Date.now();
        let toolContent: string;
        let toolStatus: "success" | "error" = "success";
        try {
          const result = await tool.call(toolCall.arguments, {
            sessionId: runOptions.sessionId,
            toolCallId: toolCall.id,
          });
          throwIfAborted(runOptions.signal);
          toolContent = serializeToolResult(result);
        } catch (error) {
          throwIfAborted(runOptions.signal);
          toolStatus = "error";
          toolContent = error instanceof Error ? error.message : String(error);
        }
        const durationMs = Date.now() - startedAt;

        const toolMessage = await this.createToolMessage({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          toolContent,
          cached: tool.stubByDefault ? parseCached(toolCall.arguments.cached) : undefined,
        });
        throwIfAborted(runOptions.signal);
        nextMessages.push(toolMessage);

        onEvent({
          type: "tool_result",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          status: toolStatus,
          output: truncateOutput(toolContent),
          durationMs,
        });
      }
    }

    throw new Error(`AgentRuntime exceeded maxTurns: ${this.maxTurns}`);
  }

  private async completeTurn(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    assistantCount: number,
    runOptions: AgentRuntimeRunOptions,
  ): Promise<LLMCompletion> {
    const messageId = `assistant-${assistantCount}`;
    let content = "";
    const toolCalls: ToolCallEnvelope[] = [];
    const tools = this.toolRegistry.list();
    const llmMessages = await buildSystemPromptMessages({
      sections: this.systemPromptSections,
      context: { tools },
      messages,
    });

    throwIfAborted(runOptions.signal);
    onEvent({
      type: "assistant_message_start",
      messageId,
      payload: { role: "assistant" },
    });

    try {
      for await (const event of streamLLM(
        this.client,
        llmMessages,
        tools,
        {
          ...(this.blobStore ? { blobStore: this.blobStore } : {}),
          signal: runOptions.signal,
        },
      )) {
        switch (event.type) {
          case "text_delta":
            content += event.text;
            onEvent({
              type: "assistant_message_delta",
              messageId,
              payload: { text: event.text },
            });
            break;
          case "tool_call":
            toolCalls.push(event.toolCall);
            break;
          case "message_end":
            if (typeof event.message.content === "string") {
              content = event.message.content;
            }
            if (event.toolCalls) {
              toolCalls.splice(0, toolCalls.length, ...event.toolCalls);
            }
            break;
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        onEvent({
          type: "assistant_message_end",
          messageId,
          payload: { status: "interrupted" },
        });
      }
      throw error;
    }

    throwIfAborted(runOptions.signal);
    onEvent({
      type: "assistant_message_end",
      messageId,
      payload: { status: "completed" },
    });

    return {
      message: { role: "assistant", content },
      toolCalls,
    };
  }

  private async createToolMessage(input: {
    toolCallId: string;
    toolName: string;
    toolContent: string;
    cached?: StubCacheScope;
  }): Promise<Extract<AgentMessage, { role: "tool" }>> {
    if (!input.cached || !this.blobStore) {
      return {
        role: "tool",
        toolCallId: input.toolCallId,
        name: input.toolName,
        content: input.toolContent,
      };
    }

    const record = await this.blobStore.put({
      kind: "tool_result",
      bytes: Buffer.from(input.toolContent, "utf8"),
      extension: "txt",
    });
    return {
      role: "tool",
      toolCallId: input.toolCallId,
      name: input.toolName,
      content: renderStub({
        id: record.id,
        kind: record.kind,
        cached: input.cached,
        size: record.size,
        path: record.path,
        body: input.toolContent,
      }),
      blob: { id: record.id, cached: input.cached },
    };
  }

  async waitForPendingSummaries(messages: AgentMessage[] = []): Promise<void> {
    await this.pendingTurnSummary;
    await this.turnSummarizer?.applyStoredSummaries(messages);
  }

  private startTurnSummary(messages: AgentMessage[]): void {
    if (!this.turnSummarizer) return;
    this.pendingTurnSummary = this.turnSummarizer.summarizeTurn(messages);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function parseCached(value: unknown): StubCacheScope | undefined {
  if (value === "turn" || value === "persist") return value;
  return undefined;
}

function serializeToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable tool result]";
  }
}

const MAX_OUTPUT_BYTES = 8 * 1024;

function truncateOutput(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= MAX_OUTPUT_BYTES) return value;
  return value.slice(0, MAX_OUTPUT_BYTES) + "\n[...truncated]";
}
