import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type {
  AgentRunResult,
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
} from "@handagent/core/runtime/AgentRuntime.ts";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import type { SessionEvent } from "@handagent/core/storage/index.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";
import { RUN_INTERRUPTED_CODE, RUN_INTERRUPTED_MESSAGE } from "./SessionPersistence.ts";
import {
  agentMessagesToRuntimeMessages,
  toAuditEvent,
  toErrorMessage,
  toSessionMessage,
} from "./MessageTranslator.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
  waitForPendingSummaries?(messages?: AgentMessage[]): Promise<void>;
};

type PushMessage = (message: SessionMessage) => void;
type BeforeRunHook = (sessionId: string) => void | Promise<void>;

type ActiveRun = {
  controller: AbortController;
  generation: number;
  interrupted: boolean;
};

export class SessionRuntimeOrchestrator {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private nextGeneration = 0;

  constructor(
    private readonly runtime: RuntimeLike,
    private readonly persistence: SessionPersistence,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly beforeRun: BeforeRunHook = () => {},
  ) {}

  async handleUserMessage(
    message: Extract<SessionMessage, { type: "user_message" }>,
    push: PushMessage,
  ): Promise<void> {
    const { sessionId } = message;
    const activeRun: ActiveRun = {
      controller: new AbortController(),
      generation: this.nextGeneration + 1,
      interrupted: false,
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

    const history = await this.persistence.getMessages(sessionId);
    await this.beforeRun(sessionId);
    await this.runtime.waitForPendingSummaries?.(history);
    const runtimeHistory = agentMessagesToRuntimeMessages(history);

    try {
      const events: SessionEvent[] = [];
      const result = await this.runtime.runWithMessages(
        runtimeHistory,
        (event) => {
          if (!this.isActive(sessionId, activeRun) || activeRun.controller.signal.aborted) {
            return;
          }
          const outgoing = toSessionMessage(sessionId, event, this.now());
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
      const errorMessage = toErrorMessage(error);
      push({
        type: "error",
        sessionId,
        messageId: `${sessionId}-error`,
        timestamp: this.now(),
        payload: {
          message: errorMessage,
        },
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

    while (this.activeRuns.has(sessionId)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private emitInterrupted(sessionId: string, push: PushMessage, activeRun: ActiveRun): void {
    activeRun.interrupted = true;
    push({
      type: "assistant_message_end",
      sessionId,
      messageId: `${sessionId}-interrupted`,
      timestamp: this.now(),
      payload: { status: "interrupted" },
    });
    push({
      type: "status",
      sessionId,
      messageId: `${sessionId}-status`,
      timestamp: this.now(),
      payload: { value: "interrupted" },
    });
  }

  private async persistInterrupted(sessionId: string, activeRun: ActiveRun): Promise<void> {
    if (!activeRun.interrupted) return;
    await this.persistence.persistError(
      sessionId,
      RUN_INTERRUPTED_MESSAGE,
      RUN_INTERRUPTED_CODE,
    );
  }

  private isActive(sessionId: string, activeRun: ActiveRun): boolean {
    return this.activeRuns.get(sessionId)?.generation === activeRun.generation;
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
