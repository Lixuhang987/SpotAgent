import type { WorkspaceAskCandidate } from "./ThreadProtocolShared.ts";

export type ServerRequest =
  | {
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
    }
  | {
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
