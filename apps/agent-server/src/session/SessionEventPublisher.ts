import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { SessionEvent } from "@handagent/core/protocol/SessionEvent.ts";

export type PublishedSessionMessage = SessionEvent | ServerRequest;
type SendEvent = (event: PublishedSessionMessage) => void;

type ConnectionState = {
  send: SendEvent;
  subscriptions: Set<string>;
};

export class SessionEventPublisher {
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

  subscribe(connectionId: string, sessionId: string): void {
    this.connections.get(connectionId)?.subscriptions.add(sessionId);
  }

  unsubscribe(connectionId: string, sessionId: string): void {
    this.connections.get(connectionId)?.subscriptions.delete(sessionId);
  }

  publish(event: PublishedSessionMessage): void {
    if (hasSessionId(event)) {
      for (const state of this.connections.values()) {
        if (state.subscriptions.has(event.sessionId)) {
          state.send(event);
        }
      }
      return;
    }

    for (const state of this.connections.values()) {
      state.send(event);
    }
  }

  publishToConnection(connectionId: string, event: PublishedSessionMessage): void {
    this.connections.get(connectionId)?.send(event);
  }
}

function hasSessionId(
  event: PublishedSessionMessage,
): event is PublishedSessionMessage & { sessionId: string } {
  return "sessionId" in event && typeof event.sessionId === "string";
}
