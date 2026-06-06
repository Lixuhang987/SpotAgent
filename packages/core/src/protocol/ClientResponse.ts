export type ClientResponse =
  | {
      type: "permission.answered";
      requestId: string;
      timestamp: string;
      payload: {
        decision: "allow" | "deny";
        scope?: "once" | "thread" | "always";
        reason?: string;
      };
    }
  | {
      type: "workspace.answered";
      requestId: string;
      timestamp: string;
      payload: {
        workspaceId?: string;
        cancelled?: boolean;
      };
    };
