import { produce } from "immer";
import { create } from "zustand";
import type {
  InitialPromptPayload,
  RunStatus,
  ServerRequest,
  ThreadAttachment,
  ThreadListEntry,
  ThreadNotification,
  WorkspaceAskCandidate,
} from "../protocol/threadProtocol.ts";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  pending?: boolean;
  attachments?: ThreadAttachment[];
  toolName?: string;
  status?: string;
};

export type PermissionRequestState = {
  id: string;
  toolName: string;
  toolCallId: string;
  argumentsJSON: string;
};

export type WorkspaceRequestState = {
  id: string;
  prompt: string;
  candidates: WorkspaceAskCandidate[];
};

export type ThreadTabState = {
  threadId: string;
  title: string | null;
  status: RunStatus;
  messages: ThreadMessage[];
  pendingInitialPrompt: InitialPromptPayload | null;
  permissionRequests: PermissionRequestState[];
  workspaceRequests: WorkspaceRequestState[];
  errorMessage: string | null;
};

export type ThreadWindowState = {
  connectionState: ConnectionState;
  windowErrorMessage: string | null;
  history: ThreadListEntry[];
  tabs: Record<string, ThreadTabState>;
  activeTabId: string | null;
  pendingInitialPrompts: Record<string, InitialPromptPayload>;
  processedNotificationIds: Record<string, true>;
  setConnectionState(state: ConnectionState): void;
  enqueueInitialPrompt(prompt: InitialPromptPayload): void;
  openHistoryThread(threadId: string): void;
  closeTab(threadId: string): void;
  resolvePermissionRequest(requestId: string): void;
  resolveWorkspaceRequest(requestId: string): void;
  handleNotification(notification: ThreadNotification): void;
  handleRequest(request: ServerRequest): void;
};

function emptyTab(threadId: string, title: string | null = null): ThreadTabState {
  return {
    threadId,
    title,
    status: "idle",
    messages: [],
    pendingInitialPrompt: null,
    permissionRequests: [],
    workspaceRequests: [],
    errorMessage: null,
  };
}

export const createThreadWindowStore = create<ThreadWindowState>((set) => ({
  connectionState: "disconnected",
  windowErrorMessage: null,
  history: [],
  tabs: {},
  activeTabId: null,
  pendingInitialPrompts: {},
  processedNotificationIds: {},

  setConnectionState(state) {
    set({ connectionState: state });
  },

  enqueueInitialPrompt(prompt) {
    set(produce<ThreadWindowState>((draft) => {
      draft.pendingInitialPrompts[prompt.clientRequestId] = prompt;
    }));
  },

  openHistoryThread(threadId) {
    set(produce<ThreadWindowState>((draft) => {
      draft.tabs[threadId] ??= emptyTab(threadId);
      draft.activeTabId = threadId;
    }));
  },

  closeTab(threadId) {
    set(produce<ThreadWindowState>((draft) => {
      delete draft.tabs[threadId];
      if (draft.activeTabId === threadId) {
        draft.activeTabId = Object.keys(draft.tabs)[0] ?? null;
      }
    }));
  },

  resolvePermissionRequest(requestId) {
    set(produce<ThreadWindowState>((draft) => {
      for (const tab of Object.values(draft.tabs)) {
        tab.permissionRequests = tab.permissionRequests.filter((request) => request.id !== requestId);
      }
    }));
  },

  resolveWorkspaceRequest(requestId) {
    set(produce<ThreadWindowState>((draft) => {
      for (const tab of Object.values(draft.tabs)) {
        tab.workspaceRequests = tab.workspaceRequests.filter((request) => request.id !== requestId);
      }
    }));
  },

  handleNotification(notification) {
    set(produce<ThreadWindowState>((draft) => {
      switch (notification.type) {
        case "thread.started": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const prompt = notification.commandId
            ? draft.pendingInitialPrompts[notification.commandId]
            : undefined;
          if (notification.commandId) {
            delete draft.pendingInitialPrompts[notification.commandId];
          }
          draft.tabs[notification.threadId] = emptyTab(notification.threadId, notification.payload.preview);
          draft.tabs[notification.threadId].pendingInitialPrompt = prompt ?? null;
          draft.activeTabId = notification.threadId;
          break;
        }

        case "thread.snapshot": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          tab.status = notification.payload.status;
          tab.messages = notification.payload.messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            status: message.status,
            toolName: message.toolCall?.name,
          }));
          if (
            tab.pendingInitialPrompt
            && !tab.messages.some(
              (message) => message.role === "user" && message.text === tab.pendingInitialPrompt?.text,
            )
          ) {
            tab.messages.unshift({
              id: `pending-${tab.pendingInitialPrompt.clientRequestId}`,
              role: "user",
              text: tab.pendingInitialPrompt.text,
              pending: true,
              attachments: tab.pendingInitialPrompt.attachments,
            });
          }
          break;
        }

        case "user.message.recorded": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          tab.messages = tab.messages.filter((message) => !message.pending);
          tab.messages.push({
            id: notification.payload.messageId,
            role: "user",
            text: notification.payload.text,
          });
          break;
        }

        case "turn.started": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          tab.status = "running";
          break;
        }

        case "assistant.delta": {
          if (draft.processedNotificationIds[notification.notificationId]) {
            break;
          }
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          const existing = tab.messages.find((message) => message.id === notification.itemId);
          if (existing) {
            existing.text += notification.payload.text;
          } else {
            tab.messages.push({
              id: notification.itemId,
              role: "assistant",
              text: notification.payload.text,
            });
          }
          break;
        }

        case "tool.started": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          tab.messages.push({
            id: notification.itemId,
            role: "tool",
            text: JSON.stringify(notification.payload.input),
            toolName: notification.payload.name,
            status: "running",
          });
          break;
        }

        case "tool.finished": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          const existing = tab.messages.find((message) => message.id === notification.itemId);
          if (existing) {
            existing.text = notification.payload.output;
            existing.status = notification.payload.status;
            existing.toolName = notification.payload.name;
          } else {
            tab.messages.push({
              id: notification.itemId,
              role: "tool",
              text: notification.payload.output,
              toolName: notification.payload.name,
              status: notification.payload.status,
            });
          }
          break;
        }

        case "turn.completed": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          tab.status = notification.payload.status === "completed" ? "idle" : notification.payload.status;
          tab.pendingInitialPrompt = null;
          break;
        }

        case "thread.status.changed": {
          draft.processedNotificationIds[notification.notificationId] = true;
          const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
          tab.status = notification.payload.value;
          break;
        }

        case "thread.listed":
          draft.processedNotificationIds[notification.notificationId] = true;
          draft.history = notification.payload.threads;
          break;

        case "thread.deleted":
          draft.processedNotificationIds[notification.notificationId] = true;
          if (notification.payload.status !== "deleted") {
            break;
          }
          draft.history = draft.history.filter((item) => item.id !== notification.payload.targetThreadId);
          delete draft.tabs[notification.payload.targetThreadId];
          if (draft.activeTabId === notification.payload.targetThreadId) {
            draft.activeTabId = Object.keys(draft.tabs)[0] ?? null;
          }
          break;

        case "thread.error": {
          draft.processedNotificationIds[notification.notificationId] = true;
          if (notification.commandId) {
            delete draft.pendingInitialPrompts[notification.commandId];
          }
          if (notification.threadId) {
            const tab = draft.tabs[notification.threadId] ??= emptyTab(notification.threadId);
            tab.errorMessage = notification.payload.message;
            tab.status = "failed";
          } else {
            draft.windowErrorMessage = notification.payload.message;
          }
          break;
        }
      }
    }));
  },

  handleRequest(request) {
    set(produce<ThreadWindowState>((draft) => {
      const tab = draft.tabs[request.threadId] ??= emptyTab(request.threadId);
      if (request.type === "permission.requested") {
        tab.permissionRequests.push({
          id: request.requestId,
          toolName: request.payload.toolName,
          toolCallId: request.payload.toolCallId,
          argumentsJSON: JSON.stringify(request.payload.arguments),
        });
      } else {
        tab.workspaceRequests.push({
          id: request.requestId,
          prompt: request.payload.prompt,
          candidates: request.payload.candidates,
        });
      }
    }));
  },
}));
