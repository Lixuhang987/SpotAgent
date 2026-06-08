import type {
  ActionBindingPayload,
  ThreadAttachment,
} from "./ThreadProtocolShared.ts";

export type ThreadCommand =
  | {
      type: "thread.start";
      commandId: string;
      timestamp: string;
      payload: {
        workspaceId: string | null;
        actionBinding: ActionBindingPayload | null;
      };
    }
  | {
      type: "thread.resume";
      threadId: string;
      commandId: string;
      timestamp: string;
    }
  | {
      type: "thread.list";
      commandId: string;
      timestamp: string;
    }
  | {
      type: "thread.delete";
      commandId: string;
      timestamp: string;
      payload: {
        targetThreadId: string;
      };
    }
  | {
      type: "input.submit";
      threadId: string;
      inputId: string;
      timestamp: string;
      payload: {
        text: string;
        attachments?: ThreadAttachment[];
      };
    }
  | {
      type: "turn.interrupt";
      threadId: string;
      commandId: string;
      timestamp: string;
    }
  | {
      type: "workspace.list";
      commandId: string;
      timestamp: string;
    };
