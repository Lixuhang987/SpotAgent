export type PermissionDecision = "allow" | "deny" | "ask";

export type PermissionRequest = {
  toolName: string;
  arguments: Record<string, unknown>;
  threadId?: string;
  toolCallId: string;
};

export type PermissionResolution =
  | { decision: "allow"; remember?: PermissionScope }
  | { decision: "deny"; remember?: PermissionScope; reason?: string };

export type PermissionScope = "once" | "thread" | "always";

export interface PermissionPolicy {
  check(request: PermissionRequest): Promise<PermissionDecision>;
  resolveAsk(request: PermissionRequest): Promise<PermissionResolution>;
  remember(
    request: PermissionRequest,
    resolution: PermissionResolution,
  ): Promise<void>;
}

export class AllowAllPermissionPolicy implements PermissionPolicy {
  async check(): Promise<PermissionDecision> {
    return "allow";
  }

  async resolveAsk(): Promise<PermissionResolution> {
    return { decision: "allow" };
  }

  async remember(): Promise<void> {}
}

export const DENY_TOOL_RESULT_TEXT = "用户拒绝执行该 tool";
