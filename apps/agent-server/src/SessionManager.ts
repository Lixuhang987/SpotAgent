import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type {
  AgentRuntimeEvent,
  AgentRunResult,
} from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";

type SessionRecord = {
  messages: AgentMessage[];
};

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
  ): Promise<AgentRunResult>;
};

type PushMessage = (message: SessionMessage) => void;
type SessionManagerOptions = {
  now?: () => string;
};

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly now: () => string;

  constructor(
    private readonly runtime: RuntimeLike,
    private readonly pushMessage: PushMessage = () => {},
    options: SessionManagerOptions = {},
  ) {
    this.now = options.now ?? (() => "2026-05-11T00:00:00.000Z");
  }

  getSessionMessages(sessionId: string): AgentMessage[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  async receive(message: SessionMessage, pushMessage?: PushMessage): Promise<void> {
    if (message.type !== "user_message") {
      return;
    }

    const session = this.sessions.get(message.sessionId) ?? { messages: [] };
    const nextMessages = [
      ...session.messages,
      {
        role: "user" as const,
        content: message.payload.text,
      },
    ];

    this.sessions.set(message.sessionId, { messages: nextMessages });

    const result = await this.runtime.runWithMessages(nextMessages, (event) => {
      const push = pushMessage ?? this.pushMessage;
      push(toSessionMessage(message.sessionId, event, this.now()));
    });

    this.sessions.set(message.sessionId, {
      messages: result.messages,
    });
  }
}

function toSessionMessage(
  sessionId: string,
  event: AgentRuntimeEvent,
  timestamp: string,
): Extract<
  SessionMessage,
  | { type: "assistant_message_start" }
  | { type: "assistant_message_delta" }
  | { type: "assistant_message_end" }
> {
  const messageId = `${sessionId}-${event.messageId}`;

  switch (event.type) {
    case "assistant_message_start":
      return {
        type: "assistant_message_start",
        sessionId,
        messageId,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_delta":
      return {
        type: "assistant_message_delta",
        sessionId,
        messageId,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_end":
      return {
        type: "assistant_message_end",
        sessionId,
        messageId,
        timestamp,
        payload: event.payload,
      };
  }
}
