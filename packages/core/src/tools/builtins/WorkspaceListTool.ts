import type { AgentTool } from "../AgentTool.ts";
import type { WorkspaceRegistry, WorkspaceSummary } from "../../workspace/Workspace.ts";

export type WorkspaceListToolInput = Record<string, never>;
export type WorkspaceListToolOutput = {
  workspaces: WorkspaceSummary[];
};

export class WorkspaceListTool implements AgentTool<WorkspaceListToolInput, WorkspaceListToolOutput> {
  name = "workspace.list";
  description =
    "列出已注册的 workspace（id / name / description / isDefault）。在调用 file.read / file.write 前若不确定写到哪里，先调本工具看 description，自行选择最匹配的 workspace；若多个候选都匹配再调用 workspace.askUser 让用户确认。";
  inputSchema = {
    type: "object",
    properties: {},
    additionalProperties: false,
  } as const;

  constructor(private readonly registry: WorkspaceRegistry) {}

  async call(): Promise<WorkspaceListToolOutput> {
    const workspaces = await this.registry.summarize();
    return { workspaces };
  }
}
