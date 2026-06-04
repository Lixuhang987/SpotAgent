import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type {
  AgentRunResult,
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
} from "@handagent/core/runtime/AgentRuntime.ts";
import type { SessionEvent as ProtocolSessionEvent } from "@handagent/core/protocol/SessionEvent.ts";
import type { UserMessageAttachment } from "@handagent/core/protocol/SessionProtocolShared.ts";
import type { SessionEvent as AuditSessionEvent } from "@handagent/core/storage/index.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";
import { RUN_INTERRUPTED_CODE, RUN_INTERRUPTED_MESSAGE } from "./SessionPersistence.ts";
import {
  agentMessagesToRuntimeMessages,
  toAuditEvent,
  toErrorMessage,
  toSessionEvent,
} from "../protocol/MessageTranslator.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
  waitForPendingSummaries?(messages?: AgentMessage[]): Promise<void>;
};
type RuntimeResolver = RuntimeLike | ((sessionId: string) => RuntimeLike);

type PushMessage = (message: ProtocolSessionEvent) => void;
type BeforeRunHook = (sessionId: string) => void | Promise<void>;
type OrchestratorOptions = {
  interruptWaitTimeoutMs?: number;
  interruptPollIntervalMs?: number;
};

type UserMessageInput = {
  sessionId: string;
  messageId: string;
  timestamp: string;
  payload: {
    text: string;
    attachments?: UserMessageAttachment[];
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

export class SessionRuntimeOrchestrator {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private nextGeneration = 0;
  private readonly interruptWaitTimeoutMs: number;
  private readonly interruptPollIntervalMs: number;

  constructor(
    private readonly runtimeResolver: RuntimeResolver,
    private readonly persistence: SessionPersistence,
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
    const { sessionId } = message;
    const activeRun: ActiveRun = {
      turnId: message.messageId,
      controller: new AbortController(),
      generation: this.nextGeneration + 1,
      interrupted: false,
      interruptionPersisted: false,
    };
    this.nextGeneration = activeRun.generation;
    this.activeRuns.get(sessionId)?.controller.abort();
    this.activeRuns.set(sessionId, activeRun);

    await this.persistence.persistUserMessage(
      sessionId,
      message.payload.text,
      message.payload.attachments,
    );
    await this.persistence.autoTitle(sessionId, message.payload.text);
    push({
      type: "user_message_recorded",
      sessionId,
      eventId: `${sessionId}-${message.messageId}-user-recorded`,
      timestamp: this.now(),
      payload: {
        messageId: message.messageId,
        text: message.payload.text,
      },
    });
    push({
      type: "turn_started",
      sessionId,
      eventId: `${sessionId}-${message.messageId}-turn-started`,
      turnId: message.messageId,
      timestamp: this.now(),
      payload: {},
    });

    const history = await this.persistence.getMessages(sessionId);
    await this.beforeRun(sessionId);
    const runtime = this.runtimeForSession(sessionId);
    await runtime.waitForPendingSummaries?.(history);
    const runtimeHistory = agentMessagesToRuntimeMessages(history);

    try {
      const events: AuditSessionEvent[] = [];
      const result = await runtime.runWithMessages(
        runtimeHistory,
        (event) => {
          if (!this.isActive(sessionId, activeRun) || activeRun.controller.signal.aborted) {
            return;
          }
          const outgoing = toSessionEvent(sessionId, message.messageId, event, this.now());
          if (outgoing) {
            push(outgoing);
          }

          const auditEvent = toAuditEvent(event, this.now());
          if (auditEvent) {
            events.push(auditEvent);
          }
        },
        { sessionId, signal: activeRun.controller.signal },
      );

      if (!this.isActive(sessionId, activeRun) || activeRun.controller.signal.aborted) {
        if (this.isActive(sessionId, activeRun) && activeRun.interrupted) {
          await this.persistInterrupted(sessionId, activeRun);
        }
        return;
      }
      await this.persistence.persistRunResult(
        sessionId,
        mergeRuntimeResultWithPersistedHistory(history, result.messages),
        events,
      );
      push({
        type: "turn_completed",
        sessionId,
        eventId: `${sessionId}-${message.messageId}-turn-completed`,
        turnId: message.messageId,
        timestamp: this.now(),
        payload: { status: "completed" },
      });
      push({
        type: "session_status_changed",
        sessionId,
        eventId: `${sessionId}-${message.messageId}-status-idle`,
        timestamp: this.now(),
        payload: { value: "idle" },
      });
    } catch (error) {
      if (isAbortError(error)) {
        if (this.isActive(sessionId, activeRun)) {
          if (!activeRun.interrupted) {
            this.emitInterrupted(sessionId, push, activeRun);
          }
          await this.persistInterrupted(sessionId, activeRun);
        }
        return;
      }
      if (!this.isActive(sessionId, activeRun)) {
        return;
      }
      if (activeRun.controller.signal.aborted) {
        if (activeRun.interrupted) {
          await this.persistInterrupted(sessionId, activeRun);
        }
        return;
      }
      const errorMessage = toErrorMessage(error);
      push({
        type: "session_error",
        sessionId,
        eventId: `${sessionId}-${message.messageId}-error`,
        timestamp: this.now(),
        payload: {
          message: errorMessage,
        },
      });
      push({
        type: "turn_completed",
        sessionId,
        eventId: `${sessionId}-${message.messageId}-turn-failed`,
        turnId: message.messageId,
        timestamp: this.now(),
        payload: { status: "failed" },
      });
      push({
        type: "session_status_changed",
        sessionId,
        eventId: `${sessionId}-${message.messageId}-status-failed`,
        timestamp: this.now(),
        payload: { value: "failed" },
      });
      await this.persistence.persistError(sessionId, errorMessage);
    } finally {
      if (this.isActive(sessionId, activeRun)) {
        this.activeRuns.delete(sessionId);
      }
    }
  }

  interruptSession(sessionId: string, push: PushMessage = () => {}): void {
    const activeRun = this.activeRuns.get(sessionId);
    if (!activeRun || activeRun.interrupted) return;

    activeRun.controller.abort();
    this.emitInterrupted(sessionId, push, activeRun);
  }

  isSessionRunning(sessionId: string): boolean {
    return this.activeRuns.has(sessionId);
  }

  async interruptAndWait(sessionId: string, push: PushMessage = () => {}): Promise<void> {
    const activeRun = this.activeRuns.get(sessionId);
    if (!activeRun) return;

    this.interruptSession(sessionId, push);

    const startedAt = Date.now();
    while (this.isActive(sessionId, activeRun)) {
      if (Date.now() - startedAt >= this.interruptWaitTimeoutMs) {
        await this.persistInterrupted(sessionId, activeRun);
        if (this.isActive(sessionId, activeRun)) {
          this.activeRuns.delete(sessionId);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, this.interruptPollIntervalMs));
    }
  }

  private emitInterrupted(sessionId: string, push: PushMessage, activeRun: ActiveRun): void {
    activeRun.interrupted = true;
    push({
      type: "turn_completed",
      sessionId,
      eventId: `${sessionId}-turn-interrupted`,
      turnId: activeRun.turnId,
      timestamp: this.now(),
      payload: { status: "interrupted" },
    });
    push({
      type: "session_status_changed",
      sessionId,
      eventId: `${sessionId}-status-interrupted`,
      timestamp: this.now(),
      payload: { value: "interrupted" },
    });
  }

  private async persistInterrupted(sessionId: string, activeRun: ActiveRun): Promise<void> {
    if (!activeRun.interrupted || activeRun.interruptionPersisted) return;
    activeRun.interruptionPersisted = true;
    await this.persistence.persistError(
      sessionId,
      RUN_INTERRUPTED_MESSAGE,
      RUN_INTERRUPTED_CODE,
    );
  }

  private isActive(sessionId: string, activeRun: ActiveRun): boolean {
    return this.activeRuns.get(sessionId)?.generation === activeRun.generation;
  }

  private runtimeForSession(sessionId: string): RuntimeLike {
    return typeof this.runtimeResolver === "function"
      ? this.runtimeResolver(sessionId)
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
