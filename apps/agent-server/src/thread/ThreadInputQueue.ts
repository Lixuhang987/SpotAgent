import type { ThreadAttachment } from "@handagent/core/protocol/ThreadProtocolShared.ts";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";

export type ThreadUserInputItem = {
  kind: "user";
  threadId: string;
  messageId: string;
  timestamp: string;
  payload: {
    text: string;
    attachments?: ThreadAttachment[];
  };
};

export type ThreadResponseInputItem = {
  kind: "response";
  id: string;
  timestamp: string;
  payload: {
    messages: AgentMessage[];
  };
};

export type ThreadInputItem = ThreadUserInputItem | ThreadResponseInputItem;

type QueueWaiter = (items: ThreadInputItem[]) => void;

export class ThreadInputQueue {
  private readonly items: ThreadInputItem[] = [];
  private readonly waiters: QueueWaiter[] = [];

  enqueue(item: ThreadInputItem): void {
    this.items.push(item);
    this.resolveNextWaiter();
  }

  hasPending(): boolean {
    return this.items.length > 0;
  }

  takeAll(): ThreadInputItem[] {
    return this.items.splice(0);
  }

  clear(): void {
    this.items.splice(0);
  }

  waitForItems(): Promise<ThreadInputItem[]> {
    const ready = this.takeAll();
    if (ready.length > 0) {
      return Promise.resolve(ready);
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private resolveNextWaiter(): void {
    if (this.items.length === 0 || this.waiters.length === 0) {
      return;
    }

    const waiter = this.waiters.shift();
    waiter?.(this.takeAll());
  }
}
