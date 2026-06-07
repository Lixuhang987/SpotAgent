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
import { ThreadInputQueue, type ThreadUserInputItem } from "./ThreadInputQueue.ts";
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

type ThreadSession = {
  threadId: string;
  queue: ThreadInputQueue;
  push: PushMessage;
  loop: Promise<void> | null;
  activeRun: ActiveRun | null;
  idleWaiters: Set<() => void>;
  closed: boolean;
};

const DEFAULT_INTERRUPT_WAIT_TIMEOUT_MS = 3000;
const DEFAULT_INTERRUPT_POLL_INTERVAL_MS = 10;

export class ThreadRuntimeOrchestrator {
  private readonly sessions = new Map<string, ThreadSession>();
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
    const item: ThreadUserInputItem = {
      kind: "user",
      threadId: message.threadId,
      messageId: message.messageId,
      timestamp: message.timestamp,
      payload: {
        text: message.payload.text,
        attachments: message.payload.attachments,
      },
    };

    await this.recordUserInput(item, push);
    const session = this.getOrCreateSession(message.threadId, push);
    session.push = push;
    session.queue.enqueue(item);
    this.ensureSessionLoop(session);
  }

  interruptThread(threadId: string, push: PushMessage = () => {}): void {
    const session = this.sessions.get(threadId);
    const activeRun = session?.activeRun ?? this.activeRuns.get(threadId);
    session?.queue.clear();
    if (!activeRun || activeRun.interrupted) return;

    activeRun.controller.abort();
    this.emitInterrupted(threadId, push, activeRun);
  }

  isThreadRunning(threadId: string): boolean {
    return Boolean(this.sessions.get(threadId)?.activeRun) || this.activeRuns.has(threadId);
  }

  async waitForThreadIdle(threadId: string): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session || !session.activeRun) {
      return;
    }

    await new Promise<void>((resolve) => {
      session.idleWaiters.add(resolve);
    });
  }

  async interruptAndWait(threadId: string, push: PushMessage = () => {}): Promise<void> {
    const session = this.sessions.get(threadId);
    const activeRun = session?.activeRun ?? this.activeRuns.get(threadId);
    if (!activeRun) return;

    this.interruptThread(threadId, push);

    const startedAt = Date.now();
    while (this.isActive(threadId, activeRun)) {
      if (Date.now() - startedAt >= this.interruptWaitTimeoutMs) {
        await this.persistInterrupted(threadId, activeRun);
        if (this.isActive(threadId, activeRun)) {
          this.activeRuns.delete(threadId);
          if (session?.activeRun === activeRun) {
            session.activeRun = null;
            this.resolveIdleWaiters(session);
          }
          if (session) {
            session.closed = true;
            this.sessions.delete(threadId);
          }
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, this.interruptPollIntervalMs));
    }
  }

  private async recordUserInput(item: ThreadUserInputItem, push: PushMessage): Promise<void> {
    await this.persistence.persistUserMessage(
      item.threadId,
      item.payload.text,
      item.payload.attachments,
    );
    await this.persistence.autoTitle(item.threadId, item.payload.text);
    push({
      type: "user.message.recorded",
      threadId: item.threadId,
      notificationId: `${item.threadId}-${item.messageId}-user-recorded`,
      timestamp: this.now(),
      payload: {
        messageId: item.messageId,
        text: item.payload.text,
      },
    });
  }

  private getOrCreateSession(threadId: string, push: PushMessage): ThreadSession {
    const existing = this.sessions.get(threadId);
    if (existing) {
      return existing;
    }

    const session: ThreadSession = {
      threadId,
      queue: new ThreadInputQueue(),
      push,
      loop: null,
      activeRun: null,
      idleWaiters: new Set(),
      closed: false,
    };
    this.sessions.set(threadId, session);
    return session;
  }

  private ensureSessionLoop(session: ThreadSession): void {
    if (session.loop) {
      return;
    }

    const loop = this.runSessionLoop(session)
      .catch((error) => {
        session.push({
          type: "thread.error",
          threadId: session.threadId,
          notificationId: `${session.threadId}-session-loop-error`,
          timestamp: this.now(),
          payload: { message: toErrorMessage(error) },
        });
      })
      .finally(() => {
        if (session.loop === loop) {
          session.loop = null;
        }
        this.resolveIdleWaiters(session);
      });
    session.loop = loop;
  }

  private async runSessionLoop(session: ThreadSession): Promise<void> {
    while (!session.closed) {
      const queuedItems = await session.queue.waitForItems();
      const firstUserInput = queuedItems.find(
        (item): item is ThreadUserInputItem => item.kind === "user",
      );
      if (!firstUserInput) {
        continue;
      }

      const activeRun = this.createActiveRun(firstUserInput.messageId);
      session.activeRun = activeRun;
      this.activeRuns.set(session.threadId, activeRun);
      this.emitTurnStarted(session.threadId, firstUserInput.messageId, session.push);

      try {
        await this.runActiveTurnUntilDrained(session, activeRun);
      } finally {
        if (this.isActive(session.threadId, activeRun)) {
          this.activeRuns.delete(session.threadId);
        }
        if (session.activeRun === activeRun) {
          session.activeRun = null;
        }
        this.resolveIdleWaiters(session);
      }
    }
  }

  private createActiveRun(turnId: string): ActiveRun {
    const activeRun: ActiveRun = {
      turnId,
      controller: new AbortController(),
      generation: this.nextGeneration + 1,
      interrupted: false,
      interruptionPersisted: false,
    };
    this.nextGeneration = activeRun.generation;
    return activeRun;
  }

  private emitTurnStarted(threadId: string, turnId: string, push: PushMessage): void {
    push({
      type: "turn.started",
      threadId,
      notificationId: `${threadId}-${turnId}-turn-started`,
      turnId,
      timestamp: this.now(),
      payload: {},
    });
  }

  private async runActiveTurnUntilDrained(
    session: ThreadSession,
    activeRun: ActiveRun,
  ): Promise<void> {
    while (this.isActive(session.threadId, activeRun) && !activeRun.controller.signal.aborted) {
      const history = await this.persistence.getMessages(session.threadId);
      await this.beforeRun(session.threadId);
      const runtime = this.runtimeForThread(session.threadId);
      await runtime.waitForPendingSummaries?.(history);
      const runtimeHistory = agentMessagesToRuntimeMessages(history);
      const runtimeBaseMessageCount = runtimeHistory.length;

      try {
        const events: ThreadAuditEvent[] = [];
        const result = await runtime.runWithMessages(
          runtimeHistory,
          (event) => {
            if (!this.isActive(session.threadId, activeRun) || activeRun.controller.signal.aborted) {
              return;
            }
            const outgoing = toThreadNotification(
              session.threadId,
              activeRun.turnId,
              event,
              this.now(),
            );
            if (outgoing) {
              session.push(outgoing);
            }

            const auditEvent = toAuditEvent(event, this.now());
            if (auditEvent) {
              events.push(auditEvent);
            }
          },
          { threadId: session.threadId, signal: activeRun.controller.signal },
        );

        if (!this.isActive(session.threadId, activeRun) || activeRun.controller.signal.aborted) {
          if (this.isActive(session.threadId, activeRun) && activeRun.interrupted) {
            await this.persistInterrupted(session.threadId, activeRun);
          }
          return;
        }

        await this.persistence.persistRunDelta(
          session.threadId,
          runtimeBaseMessageCount,
          result.messages,
          events,
        );

        if (session.queue.takeAll().length > 0) {
          continue;
        }

        this.emitCompleted(session.threadId, session.push, activeRun, "completed");
        this.emitThreadStatus(session.threadId, session.push, activeRun.turnId, "idle");
        return;
      } catch (error) {
        await this.handleActiveRunError(session, activeRun, error);
        return;
      }
    }
  }

  private emitCompleted(
    threadId: string,
    push: PushMessage,
    activeRun: ActiveRun,
    status: "completed" | "failed" | "interrupted",
  ): void {
    push({
      type: "turn.completed",
      threadId,
      notificationId: `${threadId}-${activeRun.turnId}-turn-${status}`,
      turnId: activeRun.turnId,
      timestamp: this.now(),
      payload: { status },
    });
  }

  private emitThreadStatus(
    threadId: string,
    push: PushMessage,
    turnId: string,
    value: "idle" | "failed" | "interrupted",
  ): void {
    push({
      type: "thread.status.changed",
      threadId,
      notificationId: `${threadId}-${turnId}-status-${value}`,
      timestamp: this.now(),
      payload: { value },
    });
  }

  private async handleActiveRunError(
    session: ThreadSession,
    activeRun: ActiveRun,
    error: unknown,
  ): Promise<void> {
    if (isAbortError(error)) {
      if (this.isActive(session.threadId, activeRun)) {
        if (!activeRun.interrupted) {
          this.emitInterrupted(session.threadId, session.push, activeRun);
        }
        await this.persistInterrupted(session.threadId, activeRun);
      }
      return;
    }
    if (!this.isActive(session.threadId, activeRun)) {
      return;
    }
    if (activeRun.controller.signal.aborted) {
      if (activeRun.interrupted) {
        await this.persistInterrupted(session.threadId, activeRun);
      }
      return;
    }
    const errorMessage = toErrorMessage(error);
    session.push({
      type: "thread.error",
      threadId: session.threadId,
      notificationId: `${session.threadId}-${activeRun.turnId}-error`,
      timestamp: this.now(),
      payload: { message: errorMessage },
    });
    this.emitCompleted(session.threadId, session.push, activeRun, "failed");
    this.emitThreadStatus(session.threadId, session.push, activeRun.turnId, "failed");
    await this.persistence.persistError(session.threadId, errorMessage);
  }

  private resolveIdleWaiters(session: ThreadSession): void {
    const waiters = [...session.idleWaiters];
    session.idleWaiters.clear();
    for (const resolve of waiters) {
      resolve();
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
