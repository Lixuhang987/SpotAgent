import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type { WorkspaceRegistry, WorkspaceSummary } from "../../workspace/Workspace.ts";

const InputSchema = z.object({
  prompt: z.string().trim().min(1),
  candidateIds: z.array(z.string().trim().min(1)).min(1).optional(),
});

export type WorkspaceAskUserToolInput = z.infer<typeof InputSchema>;

export type WorkspaceAskUserRequest = {
  sessionId?: string;
  toolCallId?: string;
  prompt: string;
  candidates: WorkspaceSummary[];
};

export type WorkspaceAskUserResult =
  | { workspaceId: string; cancelled?: false }
  | { cancelled: true };

export type WorkspaceAskResolver = (
  request: WorkspaceAskUserRequest,
) => Promise<WorkspaceAskUserResult>;

export type WorkspaceAskUserToolDeps = {
  registry: WorkspaceRegistry;
  askResolver: WorkspaceAskResolver;
};

export const WorkspaceAskUserTool = defineTool<
  WorkspaceAskUserToolInput,
  WorkspaceAskUserResult,
  WorkspaceAskUserToolDeps
>({
  name: "workspace.askUser",
  description:
    "当 workspace.list 返回多个合理候选且无法自行确定 file.read / file.write 应使用哪个 workspace 时，向用户展示候选 workspace 并等待选择。输入 prompt 说明需要用户确认的原因；candidateIds 可限制候选范围。",
  inputSchema: InputSchema,
  run: async (input, deps, context): Promise<WorkspaceAskUserResult> => {
    const summaries = await deps.registry.summarize();
    const candidateIdSet = input.candidateIds ? new Set(input.candidateIds) : null;
    const candidates = candidateIdSet
      ? summaries.filter((workspace) => candidateIdSet.has(workspace.id))
      : summaries;

    if (candidates.length === 0) {
      return { cancelled: true };
    }

    const result = await deps.askResolver({
      sessionId: context.sessionId,
      toolCallId: context.toolCallId,
      prompt: input.prompt,
      candidates,
    });

    if (result.cancelled) {
      return { cancelled: true };
    }

    if (!candidates.some((candidate) => candidate.id === result.workspaceId)) {
      throw new Error(`workspace.askUser selected workspace outside candidates: ${result.workspaceId}`);
    }

    return { workspaceId: result.workspaceId };
  },
});
