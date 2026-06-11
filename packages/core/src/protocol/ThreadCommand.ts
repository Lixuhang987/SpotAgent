import type {
  ActionBindingPayload,
} from "./ThreadProtocolShared.ts";
import type { RuntimeOp } from "./Op.ts";

export type ThreadStartCommand = {
  type: "thread.start";
  commandId: string;
  timestamp: string;
  payload: {
    workspaceId: string | null;
    actionBinding: ActionBindingPayload | null;
  };
};

export type ThreadResumeCommand = {
  type: "thread.resume";
  threadId: string;
  commandId: string;
  timestamp: string;
};

export type ThreadListCommand = {
  type: "thread.list";
  commandId: string;
  timestamp: string;
};

export type ThreadDeleteCommand = {
  type: "thread.delete";
  commandId: string;
  timestamp: string;
  payload: {
    targetThreadId: string;
  };
};

export type OpSubmitCommand = {
  type: "op.submit";
  threadId: string;
  commandId: string;
  timestamp: string;
  payload: {
    op: RuntimeOp;
  };
};

export type WorkspaceListCommand = {
  type: "workspace.list";
  commandId: string;
  timestamp: string;
};

export type ThreadCommand =
  | ThreadStartCommand
  | ThreadResumeCommand
  | ThreadListCommand
  | ThreadDeleteCommand
  | OpSubmitCommand
  | WorkspaceListCommand;
