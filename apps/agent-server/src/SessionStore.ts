import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";

export type SessionRecord = {
  sessionId: string;
  messages: AgentMessage[];
  updatedAt: string;
};

export interface SessionStore {
  save(record: SessionRecord): void;
  get(sessionId: string): SessionRecord | null;
  listSessions(): Array<Pick<SessionRecord, "sessionId" | "updatedAt">>;
  getSessionHistory(sessionId: string): AgentMessage[];
}

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  save(record: SessionRecord): void {
    this.records.set(record.sessionId, record);
  }

  get(sessionId: string): SessionRecord | null {
    return this.records.get(sessionId) ?? null;
  }

  listSessions(): Array<Pick<SessionRecord, "sessionId" | "updatedAt">> {
    return [...this.records.values()].map(({ sessionId, updatedAt }) => ({
      sessionId,
      updatedAt,
    }));
  }

  getSessionHistory(sessionId: string): AgentMessage[] {
    return this.records.get(sessionId)?.messages ?? [];
  }
}
