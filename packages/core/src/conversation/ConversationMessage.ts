export type ToolMessageStatus = "running" | "completed" | "failed";

export type ConversationMessageStatus = "streaming" | ToolMessageStatus;

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  status: ConversationMessageStatus;
  createdAt: string;
  updatedAt: string;
  toolCall?: {
    name: string;
  };
  error?: string;
};
