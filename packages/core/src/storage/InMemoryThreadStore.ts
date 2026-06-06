import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { PersistedThread, ThreadAuditEvent } from "./ThreadRecord.ts";
import type {
  CreateThreadInput,
  ThreadStore,
  ThreadSummary,
} from "./ThreadStore.ts";

export class InMemoryThreadStore implements ThreadStore {
  private readonly records = new Map<string, PersistedThread>();

  async create(input: CreateThreadInput): Promise<PersistedThread> {
    const now = input.createdAt ?? new Date().toISOString();
    const thread: PersistedThread = {
      version: 1,
      metadata: {
        id: input.id,
        preview: input.preview ?? null,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        workspaceId: input.workspaceId ?? null,
        actionBinding: input.actionBinding,
      },
      messages: [],
      events: [],
    };
    this.records.set(input.id, thread);
    return thread;
  }

  async get(threadId: string): Promise<PersistedThread | null> {
    return this.records.get(threadId) ?? null;
  }

  async delete(threadId: string): Promise<void> {
    this.records.delete(threadId);
  }

  async list(): Promise<ThreadSummary[]> {
    return [...this.records.values()]
      .map((r) => ({ ...r.metadata }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updatePreview(
    threadId: string,
    preview: string | null,
    updatedAt: string,
  ): Promise<void> {
    const record = this.records.get(threadId);
    if (!record) return;
    record.metadata.preview = preview;
    record.metadata.updatedAt = updatedAt;
  }

  async appendMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    const record = this.records.get(threadId);
    if (!record) return;
    record.messages.push(...messages);
    record.metadata.messageCount = record.messages.length;
    record.metadata.updatedAt = updatedAt;
  }

  async setMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    const record = this.records.get(threadId);
    if (!record) return;
    record.messages = messages;
    record.metadata.messageCount = messages.length;
    record.metadata.updatedAt = updatedAt;
  }

  async appendEvents(
    threadId: string,
    events: ThreadAuditEvent[],
  ): Promise<void> {
    const record = this.records.get(threadId);
    if (!record) return;
    record.events.push(...events);
  }
}
