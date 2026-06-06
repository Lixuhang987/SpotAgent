import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type {
  AgentRunResult,
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
} from "@handagent/core/runtime/AgentRuntime.ts";
import type { ThreadNotification as ProtocolThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import type { ThreadAttachment } from "@handagent/core/protocol/ThreadProtocolShared.ts";
import type { ThreadAuditEvent } from "@handagent/core/storage/index.ts";
import type { ThreadPersistence } from "./ThreadPersistence.ts";
import { RUN_INTERRUPTED_CODE, RUN_INTERRUPTED_MESSAGE } from "./ThreadPersistence.ts";
import {
  agentMessagesToRuntimeMessages,
  toAuditEvent,
  toErrorMessage,
  toThreadNotification,
} from "../protocol/MessageTranslator.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
  waitForPendingSummaries?(messages?: AgentMessage[]): Promise<void>;
};
type RuntimeResolver = RuntimeLike | ((threadId: string) => RuntimeLike);

type PushMessage = (message: ProtocolThreadNotification) => void;
type BeforeRunHook = (threadId: string) => void | Promise<void>;
type OrchestratorOptions = {
  interruptWaitTimeoutMs?: number;
  interruptPollIntervalMs?: number;
};

type UserMessageInput = {
  threadId: string;
  messageId: string;
  timestamp: string;
  payload: {
    text: string;
    attachments?: ThreadAttachment[];
  };
};

type ActiveRun = {
  turnId: string;
  controller: AbortController;
  generation: number;
  interrupted: boolean;
  interruptionPersisted: boolean;
};

const DEFAULT_INTERRUPT_WAIT_TIMEOUT_MS = 3000;
const DEFAULT_INTERRUPT_POLL_INTERVAL_MS = 10;

export class ThreadRuntimeOrchestrator {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private nextGeneration = 0;
  private readonly interruptWaitTimeoutMs: number;
  private readonly interruptPollIntervalMs: number;

  constructor(
    private readonly runtimeResolver: RuntimeResolver,
    private readonly persistence: ThreadPersistence,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly beforeRun: BeforeRunHook = () => {},
    options: OrchestratorOptions = {},
  ) {
    this.interruptWaitTimeoutMs =
      options.interruptWaitTimeoutMs ?? DEFAULT_INTERRUPT_WAIT_TIMEOUT_MS;
    this.interruptPollIntervalMs =
      options.interruptPollIntervalMs ?? DEFAULT_INTERRUPT_POLL_INTERVAL_MS;
  }

  async handleUserMessage(
    message: UserMessageInput,
    push: PushMessage,
  ): Promise<void> {
    const { threadId } = message;
    const activeRun: ActiveRun = {
      turnId: message.messageId,
      controller: new AbortController(),
      generation: this.nextGeneration + 1,
      interrupted: false,
      interruptionPersisted: false,
    };
    this.nextGeneration = activeRun.generation;
    this.activeRuns.get(threadId)?.controller.abort();
    this.activeRuns.set(threadId, activeRun);

    await this.persistence.persistUserMessage(
      threadId,
      message.payload.text,
      message.payload.attachments,
    );
    await this.persistence.autoTitle(threadId, message.payload.text);
    push({
      type: "user.message.recorded",
      threadId,
      notificationId: `${threadId}-${message.messageId}-user-recorded`,
      timestamp: this.now(),
      payload: {
        messageId: message.messageId,
        text: message.payload.text,
      },
    });
    push({
      type: "turn.started",
      threadId,
      notificationId: `${threadId}-${message.messageId}-turn-started`,
      turnId: message.messageId,
      timestamp: this.now(),
      payload: {},
    });

    const history = await this.persistence.getMessages(threadId);
    await this.beforeRun(threadId);
    const runtime = this.runtimeForThread(threadId);
    await runtime.waitForPendingSummaries?.(history);
    const runtimeHistory = agentMessagesToRuntimeMessages(history);

    try {
      const events: ThreadAuditEvent[] = [];
      const result = await runtime.runWithMessages(
        runtimeHistory,
        (event) => {
          if (!this.isActive(threadId, activeRun) || activeRun.controller.signal.aborted) {
            return;
          }
          const outgoing = toThreadNotification(threadId, message.messageId, event, this.now());
          if (outgoing) {
            push(outgoing);
          }

          const auditEvent = toAuditEvent(event, this.now());
          if (auditEvent) {
            events.push(auditEvent);
          }
        },
        { threadId, signal: activeRun.controller.signal },
      );

      if (!this.isActive(threadId, activeRun) || activeRun.controller.signal.aborted) {
        if (this.isActive(threadId, activeRun) && activeRun.interrupted) {
          await this.persistInterrupted(threadId, activeRun);
        }
        return;
      }
      await this.persistence.persistRunResult(
        threadId,
        mergeRuntimeResultWithPersistedHistory(history, result.messages),
        events,
      );
      push({
        type: "turn.completed",
        threadId,
        notificationId: `${threadId}-${message.messageId}-turn-completed`,
        turnId: message.messageId,
        timestamp: this.now(),
        payload: { status: "completed" },
      });
      push({
        type: "thread.status.changed",
        threadId,
        notificationId: `${threadId}-${message.messageId}-status-idle`,
        timestamp: this.now(),
        payload: { value: "idle" },
      });
    } catch (error) {
      if (isAbortError(error)) {
        if (this.isActive(threadId, activeRun)) {
          if (!activeRun.interrupted) {
            this.emitInterrupted(threadId, push, activeRun);
          }
          await this.persistInterrupted(threadId, activeRun);
        }
        return;
      }
      if (!this.isActive(threadId, activeRun)) {
        return;
      }
      if (activeRun.controller.signal.aborted) {
        if (activeRun.interrupted) {
          await this.persistInterrupted(threadId, activeRun);
        }
        return;
      }
      const errorMessage = toErrorMessage(error);
      push({
        type: "thread.error",
        threadId,
        notificationId: `${threadId}-${message.messageId}-error`,
        timestamp: this.now(),
        payload: {
          message: errorMessage,
        },
      });
      push({
        type: "turn.completed",
        threadId,
        notificationId: `${threadId}-${message.messageId}-turn-failed`,
        turnId: message.messageId,
        timestamp: this.now(),
        payload: { status: "failed" },
      });
      push({
        type: "thread.status.changed",
        threadId,
        notificationId: `${threadId}-${message.messageId}-status-failed`,
        timestamp: this.now(),
        payload: { value: "failed" },
      });
      await this.persistence.persistError(threadId, errorMessage);
    } finally {
      if (this.isActive(threadId, activeRun)) {
        this.activeRuns.delete(threadId);
      }
    }
  }

  interruptThread(threadId: string, push: PushMessage = () => {}): void {
    const activeRun = this.activeRuns.get(threadId);
    if (!activeRun || activeRun.interrupted) return;

    activeRun.controller.abort();
    this.emitInterrupted(threadId, push, activeRun);
  }

  isThreadRunning(threadId: string): boolean {
    return this.activeRuns.has(threadId);
  }

  async interruptAndWait(threadId: string, push: PushMessage = () => {}): Promise<void> {
    const activeRun = this.activeRuns.get(threadId);
    if (!activeRun) return;

    this.interruptThread(threadId, push);

    const startedAt = Date.now();
    while (this.isActive(threadId, activeRun)) {
      if (Date.now() - startedAt >= this.interruptWaitTimeoutMs) {
        await this.persistInterrupted(threadId, activeRun);
        if (this.isActive(threadId, activeRun)) {
          this.activeRuns.delete(threadId);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, this.interruptPollIntervalMs));
    }
  }

  private emitInterrupted(threadId: string, push: PushMessage, activeRun: ActiveRun): void {
    activeRun.interrupted = true;
    push({
      type: "turn.completed",
      threadId,
      notificationId: `${threadId}-turn-interrupted`,
      turnId: activeRun.turnId,
      timestamp: this.now(),
      payload: { status: "interrupted" },
    });
    push({
      type: "thread.status.changed",
      threadId,
      notificationId: `${threadId}-status-interrupted`,
      timestamp: this.now(),
      payload: { value: "interrupted" },
    });
  }

  private async persistInterrupted(threadId: string, activeRun: ActiveRun): Promise<void> {
    if (!activeRun.interrupted || activeRun.interruptionPersisted) return;
    activeRun.interruptionPersisted = true;
    await this.persistence.persistError(
      threadId,
      RUN_INTERRUPTED_MESSAGE,
      RUN_INTERRUPTED_CODE,
    );
  }

  private isActive(threadId: string, activeRun: ActiveRun): boolean {
    return this.activeRuns.get(threadId)?.generation === activeRun.generation;
  }

  private runtimeForThread(threadId: string): RuntimeLike {
    return typeof this.runtimeResolver === "function"
      ? this.runtimeResolver(threadId)
      : this.runtimeResolver;
  }
}

function mergeRuntimeResultWithPersistedHistory(
  persistedHistory: AgentMessage[],
  runtimeMessages: AgentMessage[],
): AgentMessage[] {
  return [
    ...persistedHistory,
    ...runtimeMessages.slice(persistedHistory.length),
  ];
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
