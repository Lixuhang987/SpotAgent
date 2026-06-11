import type { ServerRequest } from "./ServerRequest.ts";
import type { ThreadNotification } from "./ThreadNotification.ts";

export type AgentEvent = AgentThreadNotificationEvent | AgentServerRequestEvent;

export type AgentThreadNotificationEvent = {
  type: "thread.notification";
  eventId: string;
  threadId?: string;
  timestamp: string;
  payload: ThreadNotification;
};

export type AgentServerRequestEvent = {
  type: "server.request";
  eventId: string;
  threadId: string;
  timestamp: string;
  payload: ServerRequest;
};
