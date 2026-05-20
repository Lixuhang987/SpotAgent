import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { SessionEvent, PersistedSession } from "./SessionRecord.ts";
import type {
  SessionStore,
  SessionSummary,
  CreateSessionInput,
} from "./SessionStore.ts";

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, PersistedSession>();

  async create(input: CreateSessionInput): Promise<PersistedSession> {
    const now = input.createdAt ?? new Date().toISOString();
    const session: PersistedSession = {
      version: 1,
      metadata: {
        id: input.id,
        title: input.title ?? null,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        actionBinding: input.actionBinding,
      },
      messages: [],
      events: [],
    };
    this.records.set(input.id, session);
    return session;
  }

  async get(sessionId: string): Promise<PersistedSession | null> {
    return this.records.get(sessionId) ?? null;
  }

  async delete(sessionId: string): Promise<void> {
    this.records.delete(sessionId);
  }

  async list(): Promise<SessionSummary[]> {
    return [...this.records.values()]
      .map((r) => ({ ...r.metadata }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) return;
    record.metadata.title = title;
  }

  async appendMessages(
    sessionId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) return;
    record.messages.push(...messages);
    record.metadata.messageCount = record.messages.length;
    record.metadata.updatedAt = updatedAt;
  }

  async setMessages(
    sessionId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) return;
    record.messages = messages;
    record.metadata.messageCount = messages.length;
    record.metadata.updatedAt = updatedAt;
  }

  async appendEvents(
    sessionId: string,
    events: SessionEvent[],
  ): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record) return;
    record.events.push(...events);
  }
}
