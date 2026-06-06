import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";

export type PublishedThreadMessage = ThreadNotification | ServerRequest;
type SendEvent = (event: PublishedThreadMessage) => void;

type ConnectionState = {
  send: SendEvent;
  subscriptions: Set<string>;
};

export class ThreadNotificationPublisher {
  private readonly connections = new Map<string, ConnectionState>();

  attachConnection(connectionId: string, send: SendEvent): void {
    this.connections.set(connectionId, {
      send,
      subscriptions: this.connections.get(connectionId)?.subscriptions ?? new Set<string>(),
    });
  }

  detachConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  subscribe(connectionId: string, threadId: string): void {
    this.connections.get(connectionId)?.subscriptions.add(threadId);
  }

  unsubscribe(connectionId: string, threadId: string): void {
    this.connections.get(connectionId)?.subscriptions.delete(threadId);
  }

  publish(event: PublishedThreadMessage): void {
    if (hasThreadId(event)) {
      for (const state of this.connections.values()) {
        if (state.subscriptions.has(event.threadId)) {
          state.send(event);
        }
      }
      return;
    }

    for (const state of this.connections.values()) {
      state.send(event);
    }
  }

  publishToConnection(connectionId: string, event: PublishedThreadMessage): void {
    this.connections.get(connectionId)?.send(event);
  }
}

function hasThreadId(
  event: PublishedThreadMessage,
): event is PublishedThreadMessage & { threadId: string } {
  return "threadId" in event && typeof event.threadId === "string";
}
