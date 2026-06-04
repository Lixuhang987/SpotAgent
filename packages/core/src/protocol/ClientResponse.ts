export type ClientResponse =
  | {
      type: "permission_answer";
      requestId: string;
      timestamp: string;
      payload: {
        decision: "allow" | "deny";
        scope?: "once" | "session" | "always";
        reason?: string;
      };
    }
  | {
      type: "workspace_answer";
      requestId: string;
      timestamp: string;
      payload: {
        workspaceId?: string;
        cancelled?: boolean;
      };
    };
