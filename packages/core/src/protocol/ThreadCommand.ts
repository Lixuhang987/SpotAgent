import type {
  ActionBindingPayload,
} from "./ThreadProtocolShared.ts";
import type { Op } from "./Op.ts";

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
      type: "op.submit";
      threadId: string;
      commandId: string;
      timestamp: string;
      payload: {
        op: Op;
      };
    }
  | {
      type: "workspace.list";
      commandId: string;
      timestamp: string;
    };
