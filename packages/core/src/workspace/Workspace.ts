export type Workspace = {
  id: string;
  name: string;
  description: string;
  rootPath: string;
  createdAt: string;
  isDefault: boolean;
};

export type WorkspaceSummary = Pick<
  Workspace,
  "id" | "name" | "description" | "isDefault"
>;

export type WorkspaceRegistration = {
  name: string;
  description: string;
  rootPath: string;
  isDefault?: boolean;
};

export type WorkspaceUpdate = {
  name?: string;
  description?: string;
};

export interface WorkspaceRegistry {
  list(): Promise<Workspace[]>;
  summarize(): Promise<WorkspaceSummary[]>;
  get(id: string): Promise<Workspace | null>;
  getDefault(): Promise<Workspace>;
  register(input: WorkspaceRegistration): Promise<Workspace>;
  update(id: string, patch: WorkspaceUpdate): Promise<Workspace>;
  remove(id: string): Promise<void>;
}
