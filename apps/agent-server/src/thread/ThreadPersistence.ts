import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { BlobStore } from "@handagent/core/blob/BlobStore.ts";
import { FilesystemBlobStore } from "@handagent/core/blob/FilesystemBlobStore.ts";
import type {
  PersistedThread,
  ThreadActionBinding,
  ThreadAuditEvent,
  ThreadStore,
  ThreadSummary,
} from "@handagent/core/storage/index.ts";
import {
  agentMessagesToConversation,
  composeUserContent,
  deriveTitle,
} from "../protocol/MessageTranslator.ts";

export class ThreadPersistence {
  constructor(
    private readonly store: ThreadStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly blobStore: BlobStore = new FilesystemBlobStore(),
  ) {}

  async createThread(
    preview?: string,
    actionBinding?: ThreadActionBinding,
    workspaceId?: string | null,
  ): Promise<PersistedThread> {
    const id = generateThreadId();
    return this.store.create({ id, preview, createdAt: this.now(), workspaceId, actionBinding });
  }

  async deleteThread(threadId: string): Promise<void> {
    return this.store.delete(threadId);
  }

  async renameThread(threadId: string, preview: string): Promise<void> {
    return this.store.updatePreview(threadId, preview, this.now());
  }

  async listThreads(): Promise<ThreadSummary[]> {
    return this.store.list();
  }

  async getThread(threadId: string): Promise<PersistedThread | null> {
    return this.store.get(threadId);
  }

  async ensureThread(threadId: string): Promise<void> {
    const existing = await this.store.get(threadId);
    if (existing) return;

    await this.store.create({
      id: threadId,
      createdAt: this.now(),
    });
  }

  async persistUserMessage(
    threadId: string,
    text: string,
    attachments?: Parameters<typeof composeUserContent>[1],
  ): Promise<void> {
    const userMessage: AgentMessage = {
      role: "user",
      content: await composeUserContent(text, attachments, this.blobStore),
    };
    await this.store.appendMessages(threadId, [userMessage], this.now());
  }

  async autoTitle(threadId: string, text: string): Promise<void> {
    const thread = await this.store.get(threadId);
    if (!thread) return;
    if (thread.metadata.preview || thread.messages.length !== 1) return;

    await this.store.updatePreview(threadId, deriveTitle(text), this.now());
  }

  async getMessages(threadId: string): Promise<AgentMessage[]> {
    const Thread = await this.store.get(threadId);
    return Thread?.messages ?? [];
  }

  async getConversationMessages(threadId: string) {
    const messages = await this.getMessages(threadId);
    return agentMessagesToConversation(messages);
  }

  async recoverIncompleteTurnForSnapshot(
    threadId: string,
    timestamp = this.now(),
  ): Promise<"failed" | "interrupted" | null> {
    const thread = await this.store.get(threadId);
    if (!thread || !isIncompleteTurn(thread.messages)) {
      return null;
    }

    const lastError = [...thread.events]
      .reverse()
      .find(
        (event) =>
          event.type === "error" &&
          event.timestamp.localeCompare(thread.metadata.updatedAt) >= 0,
      );
    if (lastError?.code === RUN_INTERRUPTED_CODE) {
      return "interrupted";
    }
    if (lastError) {
      await this.store.setMessages(
        threadId,
        [
          ...thread.messages,
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
      threadId,
      [
        ...thread.messages,
        {
          role: "assistant",
          content: RUN_LOST_AFTER_RESTART_MESSAGE,
        },
      ],
      timestamp,
    );

    await this.store.appendEvents(threadId, [
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
    threadId: string,
    messages: AgentMessage[],
    events: ThreadAuditEvent[],
  ): Promise<void> {
    await this.store.setMessages(threadId, messages, this.now());
    if (events.length > 0) {
      await this.store.appendEvents(threadId, events);
    }
  }

  async persistError(threadId: string, errorMessage: string, code?: string): Promise<void> {
    const event: ThreadAuditEvent = {
      type: "error",
      timestamp: this.now(),
      message: errorMessage,
      ...(code ? { code } : {}),
    };
    await this.store.appendEvents(threadId, [
      event,
    ]);
  }
}

export const RUN_INTERRUPTED_CODE = "run_interrupted";
export const RUN_INTERRUPTED_MESSAGE = "本轮运行已中断。";
export const RUN_LOST_AFTER_RESTART_CODE = "run_lost_after_restart";
export const RUN_LOST_AFTER_RESTART_MESSAGE = "本轮运行因 agent-server 重启而中断，请重新发送请求。";

function generateThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isIncompleteTurn(messages: AgentMessage[]): boolean {
  return messages.at(-1)?.role === "user";
}
