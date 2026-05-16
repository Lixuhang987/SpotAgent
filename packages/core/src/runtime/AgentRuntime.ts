import type { AgentMessage } from "./AgentMessage.ts";
import type { ToolCallEnvelope } from "./ToolCallEnvelope.ts";
import type { LLMClient } from "../llm/LLMClient.ts";
import { ToolRegistry } from "../tools/ToolRegistry.ts";
import type { PermissionPolicy } from "../permission/PermissionPolicy.ts";
import { AllowAllPermissionPolicy, DENY_TOOL_RESULT_TEXT } from "../permission/PermissionPolicy.ts";

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
      payload: { status: "completed" };
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
};

export class AgentRuntime {
  private readonly maxTurns: number;
  private readonly permissionPolicy: PermissionPolicy;

  constructor(
    private readonly client: LLMClient,
    private readonly toolRegistry: ToolRegistry,
    options?: { maxTurns?: number; permissionPolicy?: PermissionPolicy }
  ) {
    this.maxTurns = options?.maxTurns ?? 8;
    this.permissionPolicy = options?.permissionPolicy ?? new AllowAllPermissionPolicy();
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
    const bubbles: AgentBubble[] = [];
    let assistantCount = 0;

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const completion = await this.client.complete(
        nextMessages,
        this.toolRegistry.list()
      );
      const assistantMessage =
        completion.toolCalls && completion.toolCalls.length > 0
          ? {
              ...completion.message,
              toolCalls: completion.toolCalls,
            }
          : completion.message;

      nextMessages.push(assistantMessage);
      if (assistantMessage.role === "assistant") {
        assistantCount += 1;
        const messageId = `assistant-${assistantCount}`;
        onEvent({
          type: "assistant_message_start",
          messageId,
          payload: { role: "assistant" },
        });
        onEvent({
          type: "assistant_message_delta",
          messageId,
          payload: { text: assistantMessage.content },
        });
        onEvent({
          type: "assistant_message_end",
          messageId,
          payload: { status: "completed" },
        });
        bubbles.push({
          id: messageId,
          text: assistantMessage.content,
        });
      }

      const toolCalls = completion.toolCalls ?? [];
      if (toolCalls.length === 0) {
        return {
          messages: nextMessages,
          bubbles,
        };
      }

      for (const toolCall of toolCalls) {
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
        if (decision === "ask") {
          const resolution = await this.permissionPolicy.resolveAsk(permRequest);
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
          const result = await tool.call(toolCall.arguments);
          toolContent = serializeToolResult(result);
        } catch (error) {
          toolStatus = "error";
          toolContent = error instanceof Error ? error.message : String(error);
        }
        const durationMs = Date.now() - startedAt;

        nextMessages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: toolContent,
        });

        onEvent({
          type: "tool_result",
          toolCallId: toolCall.id,
          status: toolStatus,
          output: truncateOutput(toolContent),
          durationMs,
        });
      }
    }

    throw new Error(`AgentRuntime exceeded maxTurns: ${this.maxTurns}`);
  }
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
