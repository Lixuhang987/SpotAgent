import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type {
  PersistedThread,
  ThreadActionBinding,
  ThreadAuditEvent,
  ThreadMetadata,
} from "./ThreadRecord.ts";

export type ThreadSummary = Pick<
  ThreadMetadata,
  "id" | "preview" | "createdAt" | "updatedAt" | "messageCount" | "workspaceId"
>;

export type CreateThreadInput = {
  id: string;
  preview?: string | null;
  createdAt?: string;
  workspaceId?: string | null;
  actionBinding?: ThreadActionBinding;
};

export interface ThreadStore {
  create(input: CreateThreadInput): Promise<PersistedThread>;
  get(threadId: string): Promise<PersistedThread | null>;
  delete(threadId: string): Promise<void>;
  list(): Promise<ThreadSummary[]>;

  updatePreview(threadId: string, preview: string | null, updatedAt: string): Promise<void>;
  appendMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void>;
  setMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void>;
  appendEvents(threadId: string, events: ThreadAuditEvent[]): Promise<void>;
}
