import type { WorkspaceAskCandidate } from "./SessionProtocolShared.ts";

export type ServerRequest =
  | {
      type: "permission_ask";
      requestId: string;
      sessionId: string;
      timestamp: string;
      payload: {
        toolName: string;
        toolCallId: string;
        arguments: Record<string, unknown>;
        timeoutMs?: number;
      };
    }
  | {
      type: "workspace_ask";
      requestId: string;
      sessionId: string;
      timestamp: string;
      payload: {
        toolCallId?: string;
        prompt: string;
        candidates: WorkspaceAskCandidate[];
        timeoutMs?: number;
      };
    };
