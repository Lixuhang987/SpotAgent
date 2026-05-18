import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type {
  PersistedSession,
  SessionEvent,
  SessionStore,
  SessionSummary,
} from "../../../packages/core/src/storage/index.ts";
import {
  agentMessagesToConversation,
  composeUserContent,
  deriveTitle,
} from "./MessageTranslator.ts";

export class SessionPersistence {
  constructor(
    private readonly store: SessionStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async createSession(title?: string): Promise<PersistedSession> {
    const id = generateSessionId();
    return this.store.create({ id, title, createdAt: this.now() });
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
      content: composeUserContent(text, attachments),
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

  async persistError(sessionId: string, errorMessage: string): Promise<void> {
    await this.store.appendEvents(sessionId, [
      {
        type: "error",
        timestamp: this.now(),
        message: errorMessage,
      },
    ]);
  }
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
