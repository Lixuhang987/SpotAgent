import type { WorkspaceAskCandidate } from "./ThreadProtocolShared.ts";

export type PermissionRequestedRequest = {
  type: "permission.requested";
  requestId: string;
  threadId: string;
  timestamp: string;
  payload: {
    toolName: string;
    toolCallId: string;
    arguments: Record<string, unknown>;
    timeoutMs?: number;
  };
};

export type WorkspaceRequestedRequest = {
  type: "workspace.requested";
  requestId: string;
  threadId: string;
  timestamp: string;
  payload: {
    toolCallId?: string;
    prompt: string;
    candidates: WorkspaceAskCandidate[];
    timeoutMs?: number;
  };
};

export type ServerRequest =
  | PermissionRequestedRequest
  | WorkspaceRequestedRequest;
