import type { ConversationMessage } from "../conversation/ConversationMessage.ts";

export type RunStatus = "idle" | "running" | "failed" | "interrupted";

export type UserMessageAttachment =
  | {
      kind: "text_selection";
      id: string;
      text: string;
    }
  | {
      kind: "image";
      id: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      base64: string;
    };

export type SessionListEntry = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId?: string | null;
};

export type WorkspaceAskCandidate = {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
};

export type ActionBindingPayload = {
  pluginId: string;
  promptName: string;
};

export type SessionSnapshotPayload = {
  messages: ConversationMessage[];
  status: RunStatus;
};
