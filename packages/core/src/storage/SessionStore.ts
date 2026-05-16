import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type {
  SessionMetadata,
  SessionEvent,
  PersistedSession,
} from "./SessionRecord.ts";

export type SessionSummary = Pick<
  SessionMetadata,
  "id" | "title" | "createdAt" | "updatedAt" | "messageCount"
>;

export type CreateSessionInput = {
  id: string;
  title?: string | null;
  createdAt?: string;
};

export interface SessionStore {
  create(input: CreateSessionInput): Promise<PersistedSession>;
  get(sessionId: string): Promise<PersistedSession | null>;
  delete(sessionId: string): Promise<void>;
  list(): Promise<SessionSummary[]>;

  updateTitle(sessionId: string, title: string): Promise<void>;
  appendMessages(
    sessionId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void>;
  setMessages(
    sessionId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void>;
  appendEvents(sessionId: string, events: SessionEvent[]): Promise<void>;
}
