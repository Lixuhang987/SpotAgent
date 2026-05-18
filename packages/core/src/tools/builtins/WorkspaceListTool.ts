import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type { WorkspaceRegistry, WorkspaceSummary } from "../../workspace/Workspace.ts";

const InputSchema = z.object({});

export type WorkspaceListToolOutput = { workspaces: WorkspaceSummary[] };

export const WorkspaceListTool = defineTool<
  z.infer<typeof InputSchema>,
  WorkspaceListToolOutput,
  WorkspaceRegistry
>({
  name: "workspace.list",
  description:
    "列出已注册的 workspace（id / name / description / isDefault）。在调用 file.read / file.write 前若不确定写到哪里，先调本工具看 description，自行选择最匹配的 workspace；若多个候选都匹配再调用 workspace.askUser 让用户确认。",
  inputSchema: InputSchema,
  run: async (_input, registry): Promise<WorkspaceListToolOutput> => {
    const workspaces = await registry.summarize();
    return { workspaces };
  },
});
