import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type {
  AgentRunResult,
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
} from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import type { SessionEvent } from "../../../packages/core/src/storage/index.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";
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

export class SessionRuntimeOrchestrator {
  constructor(
    private readonly runtime: RuntimeLike,
    private readonly persistence: SessionPersistence,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async handleUserMessage(
    message: Extract<SessionMessage, { type: "user_message" }>,
    push: PushMessage,
  ): Promise<void> {
    const { sessionId } = message;

    await this.persistence.ensureSession(sessionId);
    await this.persistence.persistUserMessage(
      sessionId,
      message.payload.text,
      message.payload.attachments,
    );
    await this.persistence.autoTitle(sessionId, message.payload.text);

    const history = await this.persistence.getMessages(sessionId);
    await this.runtime.waitForPendingSummaries?.(history);
    const runtimeHistory = agentMessagesToRuntimeMessages(history);

    try {
      const events: SessionEvent[] = [];
      const result = await this.runtime.runWithMessages(
        runtimeHistory,
        (event) => {
          const outgoing = toSessionMessage(sessionId, event, this.now());
          if (outgoing) {
            push(outgoing);
          }

          const auditEvent = toAuditEvent(event, this.now());
          if (auditEvent) {
            events.push(auditEvent);
          }
        },
        { sessionId },
      );

      await this.persistence.persistRunResult(
        sessionId,
        mergeRuntimeResultWithPersistedHistory(history, result.messages),
        events,
      );
    } catch (error) {
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
    }
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
