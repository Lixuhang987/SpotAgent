import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { BlobStore } from "@handagent/core/blob/BlobStore.ts";
import { FilesystemBlobStore } from "@handagent/core/blob/FilesystemBlobStore.ts";
import type {
  PersistedSession,
  SessionActionBinding,
  SessionEvent,
  SessionStore,
  SessionSummary,
} from "@handagent/core/storage/index.ts";
import {
  agentMessagesToConversation,
  composeUserContent,
  deriveTitle,
} from "../protocol/MessageTranslator.ts";

export class SessionPersistence {
  constructor(
    private readonly store: SessionStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly blobStore: BlobStore = new FilesystemBlobStore(),
  ) {}

  async createSession(
    title?: string,
    actionBinding?: SessionActionBinding,
    workspaceId?: string | null,
  ): Promise<PersistedSession> {
    const id = generateSessionId();
    return this.store.create({ id, title, createdAt: this.now(), workspaceId, actionBinding });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.store.delete(sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    return this.store.updateTitle(sessionId, title);
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.store.list();
  }

  async getSession(sessionId: string): Promise<PersistedSession | null> {
    return this.store.get(sessionId);
  }

  async ensureSession(sessionId: string): Promise<void> {
    const existing = await this.store.get(sessionId);
    if (existing) return;

    await this.store.create({
      id: sessionId,
      createdAt: this.now(),
    });
  }

  async persistUserMessage(
    sessionId: string,
    text: string,
    attachments?: Parameters<typeof composeUserContent>[1],
  ): Promise<void> {
    const userMessage: AgentMessage = {
      role: "user",
      content: await composeUserContent(text, attachments, this.blobStore),
    };
    await this.store.appendMessages(sessionId, [userMessage], this.now());
  }

  async autoTitle(sessionId: string, text: string): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session) return;
    if (session.metadata.title || session.messages.length !== 1) return;

    await this.store.updateTitle(sessionId, deriveTitle(text));
  }

  async getMessages(sessionId: string): Promise<AgentMessage[]> {
    const session = await this.store.get(sessionId);
    return session?.messages ?? [];
  }

  async getConversationMessages(sessionId: string) {
    const messages = await this.getMessages(sessionId);
    return agentMessagesToConversation(messages);
  }

  async recoverIncompleteTurnForSnapshot(
    sessionId: string,
    timestamp = this.now(),
  ): Promise<"failed" | "interrupted" | null> {
    const session = await this.store.get(sessionId);
    if (!session || !isIncompleteTurn(session.messages)) {
      return null;
    }

    const lastError = [...session.events]
      .reverse()
      .find(
        (event) =>
          event.type === "error" &&
          event.timestamp.localeCompare(session.metadata.updatedAt) >= 0,
      );
    if (lastError?.code === RUN_INTERRUPTED_CODE) {
      return "interrupted";
    }
    if (lastError) {
      await this.store.setMessages(
        sessionId,
        [
          ...session.messages,
          {
            role: "assistant",
            content: lastError.message,
          },
        ],
        timestamp,
      );
      return "failed";
    }

    await this.store.setMessages(
      sessionId,
      [
        ...session.messages,
        {
          role: "assistant",
          content: RUN_LOST_AFTER_RESTART_MESSAGE,
        },
      ],
      timestamp,
    );

    await this.store.appendEvents(sessionId, [
      {
        type: "error",
        timestamp,
        message: RUN_LOST_AFTER_RESTART_MESSAGE,
        code: RUN_LOST_AFTER_RESTART_CODE,
      },
    ]);

    return "failed";
  }

  async persistRunResult(
    sessionId: string,
    messages: AgentMessage[],
    events: SessionEvent[],
  ): Promise<void> {
    await this.store.setMessages(sessionId, messages, this.now());
    if (events.length > 0) {
      await this.store.appendEvents(sessionId, events);
    }
  }

  async persistError(sessionId: string, errorMessage: string, code?: string): Promise<void> {
    const event: SessionEvent = {
      type: "error",
      timestamp: this.now(),
      message: errorMessage,
      ...(code ? { code } : {}),
    };
    await this.store.appendEvents(sessionId, [
      event,
    ]);
  }
}

export const RUN_INTERRUPTED_CODE = "run_interrupted";
export const RUN_INTERRUPTED_MESSAGE = "本轮运行已中断。";
export const RUN_LOST_AFTER_RESTART_CODE = "run_lost_after_restart";
export const RUN_LOST_AFTER_RESTART_MESSAGE = "本轮运行因 agent-server 重启而中断，请重新发送请求。";

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isIncompleteTurn(messages: AgentMessage[]): boolean {
  return messages.at(-1)?.role === "user";
}
