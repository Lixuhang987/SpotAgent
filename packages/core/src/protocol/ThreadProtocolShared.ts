import type { ConversationMessage } from "../conversation/ConversationMessage.ts";

export type RunStatus = "idle" | "running" | "failed" | "interrupted";

export type ThreadAttachment =
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

export type ThreadListEntry = {
  id: string;
  preview: string | null;
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

export type ThreadSnapshotPayload = {
  messages: ConversationMessage[];
  status: RunStatus;
};
