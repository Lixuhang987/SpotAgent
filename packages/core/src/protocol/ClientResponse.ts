export type PermissionAnsweredResponse = {
  type: "permission.answered";
  requestId: string;
  timestamp: string;
  payload: {
    decision: "allow" | "deny";
    scope?: "once" | "thread" | "always";
    reason?: string;
  };
};

export type WorkspaceAnsweredResponse = {
  type: "workspace.answered";
  requestId: string;
  timestamp: string;
  payload: {
    workspaceId?: string;
    cancelled?: boolean;
  };
};

export type ClientResponse =
  | PermissionAnsweredResponse
  | WorkspaceAnsweredResponse;
