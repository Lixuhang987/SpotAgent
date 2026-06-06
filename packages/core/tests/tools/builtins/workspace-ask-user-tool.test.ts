import { describe, expect, it } from "vitest";
import { WorkspaceAskUserTool } from "../../../src/tools/builtins/WorkspaceAskUserTool.ts";
import type { Workspace, WorkspaceRegistry } from "../../../src/workspace/Workspace.ts";

class MemoryWorkspaceRegistry implements WorkspaceRegistry {
  constructor(private readonly workspaces: Workspace[]) {}

  async list(): Promise<Workspace[]> {
    return this.workspaces;
  }

  async summarize() {
    return this.workspaces.map(({ id, name, description, isDefault }) => ({
      id,
      name,
      description,
      isDefault,
    }));
  }

  async get(id: string): Promise<Workspace | null> {
    return this.workspaces.find((workspace) => workspace.id === id) ?? null;
  }

  async getDefault(): Promise<Workspace> {
    const workspace = this.workspaces.find((item) => item.isDefault) ?? this.workspaces[0];
    if (!workspace) throw new Error("no workspace");
    return workspace;
  }

  async register(): Promise<Workspace> {
    throw new Error("not implemented");
  }

  async update(): Promise<Workspace> {
    throw new Error("not implemented");
  }

  async remove(): Promise<void> {
    throw new Error("not implemented");
  }
}

const workspaces: Workspace[] = [
  {
    id: "default",
    name: "默认",
    description: "默认 workspace",
    rootPath: "/private/root/default",
    createdAt: "2026-05-19T00:00:00.000Z",
    isDefault: true,
  },
  {
    id: "docs",
    name: "文档",
    description: "产品和设计文档",
    rootPath: "/private/root/docs",
    createdAt: "2026-05-19T00:00:00.000Z",
    isDefault: false,
  },
  {
    id: "code",
    name: "代码",
    description: "源码工作区",
    rootPath: "/private/root/code",
    createdAt: "2026-05-19T00:00:00.000Z",
    isDefault: false,
  },
];

describe("WorkspaceAskUserTool", () => {
  it("asks the user with filtered workspace candidates and returns the selected workspace id", async () => {
    const seenRequests: unknown[] = [];
    const tool = WorkspaceAskUserTool.create({
      registry: new MemoryWorkspaceRegistry(workspaces),
      askResolver: async (request) => {
        seenRequests.push(request);
        return { workspaceId: "docs" };
      },
    });

    const result = await tool.call(
      { prompt: "保存到哪个 workspace？", candidateIds: ["docs", "code"] },
      { threadId: "thread-1", toolCallId: "tool-1" },
    );

    expect(result).toEqual({ workspaceId: "docs" });
    expect(seenRequests).toEqual([
      {
        threadId: "thread-1",
        toolCallId: "tool-1",
        prompt: "保存到哪个 workspace？",
        candidates: [
          {
            id: "docs",
            name: "文档",
            description: "产品和设计文档",
            isDefault: false,
          },
          {
            id: "code",
            name: "代码",
            description: "源码工作区",
            isDefault: false,
          },
        ],
      },
    ]);
    expect(JSON.stringify(seenRequests)).not.toContain("rootPath");
  });

  it("returns cancelled when the user cancels or the request times out", async () => {
    const tool = WorkspaceAskUserTool.create({
      registry: new MemoryWorkspaceRegistry(workspaces),
      askResolver: async () => ({ cancelled: true }),
    });

    await expect(tool.call({ prompt: "请选择 workspace" })).resolves.toEqual({
      cancelled: true,
    });
  });

  it("rejects a resolver response that selects a workspace outside the candidates", async () => {
    const tool = WorkspaceAskUserTool.create({
      registry: new MemoryWorkspaceRegistry(workspaces),
      askResolver: async () => ({ workspaceId: "missing" }),
    });

    await expect(
      tool.call({ prompt: "请选择 workspace", candidateIds: ["default", "docs"] }),
    ).rejects.toThrow(/outside candidates/);
  });
});
