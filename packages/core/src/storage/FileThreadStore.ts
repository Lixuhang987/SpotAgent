import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { PersistedThread, ThreadAuditEvent } from "./ThreadRecord.ts";
import type {
  CreateThreadInput,
  ThreadStore,
  ThreadSummary,
} from "./ThreadStore.ts";

export class FileThreadStore implements ThreadStore {
  private readonly threadWriteQueues = new Map<string, Promise<void>>();

  constructor(private readonly dir: string) {}

  async create(input: CreateThreadInput): Promise<PersistedThread> {
    return this.withThreadWriteQueue(input.id, async () => {
      await this.ensureDir();
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
      await this.write(input.id, thread);
      return thread;
    });
  }

  async get(threadId: string): Promise<PersistedThread | null> {
    try {
      const raw = await readFile(this.path(threadId), "utf-8");
      const thread = JSON.parse(raw) as PersistedThread;

      // 兼容旧版本：补全缺失的 workspaceId 字段
      if (thread.metadata && thread.metadata.workspaceId === undefined) {
        thread.metadata.workspaceId = null;
      }

      return thread;
    } catch {
      return null;
    }
  }

  async delete(threadId: string): Promise<void> {
    return this.withThreadWriteQueue(threadId, async () => {
      try {
        await unlink(this.path(threadId));
      } catch {
        // already gone
      }
    });
  }

  async list(): Promise<ThreadSummary[]> {
    await this.ensureDir();
    const files = await readdir(this.dir);
    const summaries: ThreadSummary[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.dir, file), "utf-8");
        const thread = JSON.parse(raw) as PersistedThread;

        // 兼容旧版本：补全缺失的 workspaceId 字段
        if (thread.metadata && thread.metadata.workspaceId === undefined) {
          thread.metadata.workspaceId = null;
        }

        summaries.push({ ...thread.metadata });
      } catch {
        // skip corrupted files
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updatePreview(
    threadId: string,
    preview: string | null,
    updatedAt: string,
  ): Promise<void> {
    return this.withThreadWriteQueue(threadId, async () => {
      const thread = await this.get(threadId);
      if (!thread) return;
      thread.metadata.preview = preview;
      thread.metadata.updatedAt = updatedAt;
      await this.write(threadId, thread);
    });
  }

  async appendMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    return this.withThreadWriteQueue(threadId, async () => {
      const thread = await this.get(threadId);
      if (!thread) return;
      thread.messages.push(...messages);
      thread.metadata.messageCount = thread.messages.length;
      thread.metadata.updatedAt = updatedAt;
      await this.write(threadId, thread);
    });
  }

  async setMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    return this.withThreadWriteQueue(threadId, async () => {
      const thread = await this.get(threadId);
      if (!thread) return;
      thread.messages = messages;
      thread.metadata.messageCount = messages.length;
      thread.metadata.updatedAt = updatedAt;
      await this.write(threadId, thread);
    });
  }

  async appendEvents(
    threadId: string,
    events: ThreadAuditEvent[],
  ): Promise<void> {
    return this.withThreadWriteQueue(threadId, async () => {
      const thread = await this.get(threadId);
      if (!thread) return;
      thread.events.push(...events);
      await this.write(threadId, thread);
    });
  }

  private async withThreadWriteQueue<T>(
    threadId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.threadWriteQueues.get(threadId) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => {}).then(() => current);
    this.threadWriteQueues.set(threadId, queued);

    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (this.threadWriteQueues.get(threadId) === queued) {
        this.threadWriteQueues.delete(threadId);
      }
    }
  }

  private path(threadId: string): string {
    return join(this.dir, `${threadId}.json`);
  }

  private async write(threadId: string, thread: PersistedThread): Promise<void> {
    await this.ensureDir();
    await writeFile(this.path(threadId), JSON.stringify(thread, null, 2), "utf-8");
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }
}
