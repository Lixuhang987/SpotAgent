import type { AgentMessage } from "./AgentMessage.ts";
import type { ToolCallEnvelope } from "./ToolCallEnvelope.ts";
import type { LLMClientLike } from "../llm/LLMClient.ts";
import type { LLMCompletion } from "../llm/LLMClient.ts";
import { streamLLM, throwIfAborted } from "../llm/LLMClient.ts";
import type { AgentTool } from "../tools/AgentTool.ts";
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
import {
  META_TOOL_NAME,
  META_TOOL_ALREADY_ACTIVE_RESULT,
} from "../tools/MetaToolUseTool.ts";

export type AgentRunResult = {
  messages: AgentMessage[];
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

type AgentRuntimeEventSink = (event: AgentRuntimeEvent) => void;

type ToolExecutionResult = {
  content: string;
  status: "success" | "error";
  durationMs: number;
};

export class AgentRuntime {
  private readonly maxTurns: number;
  private readonly permissionPolicy: PermissionPolicy;
  private readonly blobStore?: BlobStore;
  private readonly turnSummarizer?: TurnSummarizerLike;
  private readonly systemPromptSections: SystemPromptSection[];
  private pendingTurnSummary: Promise<void> = Promise.resolve();
  private readonly onMetaToolActivate?: (sessionId: string) => Promise<void>;
  private readonly isSessionActivated?: (sessionId: string) => boolean;

  constructor(
    private readonly client: LLMClientLike,
    private readonly toolRegistry: ToolRegistry,
    options?: {
      maxTurns?: number;
      permissionPolicy?: PermissionPolicy;
      blobStore?: BlobStore;
      turnSummarizer?: TurnSummarizerLike;
      systemPromptSections?: SystemPromptSection[];
      onMetaToolActivate?: (sessionId: string) => Promise<void>;
      isSessionActivated?: (sessionId: string) => boolean;
    }
  ) {
    this.maxTurns = options?.maxTurns ?? 100;
    this.permissionPolicy = options?.permissionPolicy ?? new AllowAllPermissionPolicy();
    this.blobStore = options?.blobStore;
    this.turnSummarizer = options?.turnSummarizer;
    this.systemPromptSections = options?.systemPromptSections ?? buildDefaultSystemPromptSections();
    this.onMetaToolActivate = options?.onMetaToolActivate;
    this.isSessionActivated = options?.isSessionActivated;
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

      const toolCalls = completion.toolCalls ?? [];
      if (toolCalls.length === 0) {
        this.startTurnSummary(nextMessages);
        return {
          messages: nextMessages,
        };
      }

      for (const toolCall of toolCalls) {
        await this.handleToolCall({
          toolCall,
          messages: nextMessages,
          onEvent,
          runOptions,
        });
      }
    }

    throw new Error(`AgentRuntime exceeded maxTurns: ${this.maxTurns}`);
  }

  private async handleToolCall(input: {
    toolCall: ToolCallEnvelope;
    messages: AgentMessage[];
    onEvent: AgentRuntimeEventSink;
    runOptions: AgentRuntimeRunOptions;
  }): Promise<void> {
    const { toolCall, messages, onEvent, runOptions } = input;
    throwIfAborted(runOptions.signal);

    const tool = this.toolRegistry.get(toolCall.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolCall.name}`);
    }

    // Meta-tool short-circuit: skip permission checks entirely
    if (toolCall.name === META_TOOL_NAME) {
      await this.handleMetaToolCall({ tool, toolCall, messages, onEvent, runOptions });
      return;
    }

    const decision = await this.resolveToolPermission(toolCall, onEvent, runOptions);
    if (decision === "deny") {
      this.appendDeniedToolResult(toolCall, messages, onEvent);
      return;
    }

    onEvent({
      type: "tool_call",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: toolCall.arguments,
    });

    const execution = await this.callTool(tool, toolCall, runOptions);
    const toolMessage = await this.createToolMessage({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      toolContent: execution.content,
      cached: tool.stubByDefault ? parseCached(toolCall.arguments.cached) : undefined,
    });
    throwIfAborted(runOptions.signal);
    messages.push(toolMessage);

    onEvent({
      type: "tool_result",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      status: execution.status,
      output: truncateOutput(execution.content),
      durationMs: execution.durationMs,
    });
  }

  private async handleMetaToolCall(input: {
    tool: AgentTool;
    toolCall: ToolCallEnvelope;
    messages: AgentMessage[];
    onEvent: AgentRuntimeEventSink;
    runOptions: AgentRuntimeRunOptions;
  }): Promise<void> {
    const { tool, toolCall, messages, onEvent, runOptions } = input;
    const { sessionId } = runOptions;
    const startedAt = Date.now();

    throwIfAborted(runOptions.signal);

    onEvent({
      type: "tool_call",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: toolCall.arguments,
    });

    let content: string;

    if (sessionId !== undefined && this.isSessionActivated?.(sessionId) === true) {
      // Already activated — return the already-active result without calling the tool
      content = META_TOOL_ALREADY_ACTIVE_RESULT;
    } else {
      // First activation: invoke the callback, then call the tool to get the result
      if (sessionId !== undefined) {
        await this.onMetaToolActivate?.(sessionId);
      }
      throwIfAborted(runOptions.signal);
      const result = await tool.call(toolCall.arguments, {
        sessionId,
        toolCallId: toolCall.id,
      });
      throwIfAborted(runOptions.signal);
      content = serializeToolResult(result);
    }

    messages.push({
      role: "tool",
      toolCallId: toolCall.id,
      name: toolCall.name,
      content,
    });

    onEvent({
      type: "tool_result",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      status: "success",
      output: truncateOutput(content),
      durationMs: Date.now() - startedAt,
    });
  }

  private async resolveToolPermission(
    toolCall: ToolCallEnvelope,
    onEvent: AgentRuntimeEventSink,
    runOptions: AgentRuntimeRunOptions,
  ): Promise<"allow" | "deny"> {
    const permRequest = {
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      sessionId: runOptions.sessionId,
      toolCallId: toolCall.id,
    };

    const decision = await this.permissionPolicy.check(permRequest);
    throwIfAborted(runOptions.signal);
    if (decision !== "ask") {
      return decision;
    }

    const resolution = await this.permissionPolicy.resolveAsk(permRequest);
    throwIfAborted(runOptions.signal);
    await this.permissionPolicy.remember(permRequest, resolution);
    onEvent({
      type: "permission_decision",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      decision: resolution.decision,
      scope: resolution.remember,
      reason: resolution.decision === "deny" ? resolution.reason : undefined,
    });
    return resolution.decision;
  }

  private appendDeniedToolResult(
    toolCall: ToolCallEnvelope,
    messages: AgentMessage[],
    onEvent: AgentRuntimeEventSink,
  ): void {
    messages.push({
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
  }

  private async callTool(
    tool: AgentTool,
    toolCall: ToolCallEnvelope,
    runOptions: AgentRuntimeRunOptions,
  ): Promise<ToolExecutionResult> {
    const startedAt = Date.now();
    let content: string;
    let status: ToolExecutionResult["status"] = "success";

    try {
      const result = await tool.call(toolCall.arguments, {
        sessionId: runOptions.sessionId,
        toolCallId: toolCall.id,
      });
      throwIfAborted(runOptions.signal);
      content = serializeToolResult(result);
    } catch (error) {
      throwIfAborted(runOptions.signal);
      status = "error";
      content = error instanceof Error ? error.message : String(error);
    }

    return {
      content,
      status,
      durationMs: Date.now() - startedAt,
    };
  }

  private async completeTurn(
    messages: AgentMessage[],
    onEvent: AgentRuntimeEventSink,
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
