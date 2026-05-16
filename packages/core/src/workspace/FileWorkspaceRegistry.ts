import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Workspace,
  WorkspaceRegistration,
  WorkspaceRegistry,
  WorkspaceSummary,
  WorkspaceUpdate,
} from "./Workspace.ts";

type PersistedFile = {
  version: 1;
  workspaces: Workspace[];
};

export type FileWorkspaceRegistryOptions = {
  filePath: string;
  defaultRootPath: string;
  defaultName?: string;
  defaultDescription?: string;
  now?: () => string;
  generateId?: () => string;
};

export class FileWorkspaceRegistry implements WorkspaceRegistry {
  private cache: Workspace[] | null = null;
  private readonly now: () => string;
  private readonly generateId: () => string;
  private readonly defaultName: string;
  private readonly defaultDescription: string;

  constructor(private readonly options: FileWorkspaceRegistryOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? (() => randomUUID());
    this.defaultName = options.defaultName ?? "default";
    this.defaultDescription =
      options.defaultDescription ?? "默认工作区，存放未归类的笔记和文件";
  }

  async list(): Promise<Workspace[]> {
    const all = await this.load();
    return all.map((w) => ({ ...w }));
  }

  async summarize(): Promise<WorkspaceSummary[]> {
    const all = await this.list();
    return all.map(({ id, name, description, isDefault }) => ({
      id,
      name,
      description,
      isDefault,
    }));
  }

  async get(id: string): Promise<Workspace | null> {
    const all = await this.load();
    const found = all.find((w) => w.id === id);
    return found ? { ...found } : null;
  }

  async getDefault(): Promise<Workspace> {
    const all = await this.load();
    const def = all.find((w) => w.isDefault);
    if (!def) {
      throw new Error("Default workspace is missing");
    }
    return { ...def };
  }

  async register(input: WorkspaceRegistration): Promise<Workspace> {
    const name = input.name.trim();
    const description = input.description.trim();
    if (!name) throw new Error("workspace name is required");
    if (!isAbsolute(input.rootPath)) {
      throw new Error(`workspace rootPath must be absolute: ${input.rootPath}`);
    }

    await mkdir(input.rootPath, { recursive: true });

    const all = await this.load();
    const isDefault = input.isDefault ?? all.length === 0;
    if (isDefault) {
      for (const existing of all) existing.isDefault = false;
    }

    const created: Workspace = {
      id: this.generateId(),
      name,
      description,
      rootPath: input.rootPath,
      createdAt: this.now(),
      isDefault,
    };

    all.push(created);
    await this.persist(all);
    return { ...created };
  }

  async update(id: string, patch: WorkspaceUpdate): Promise<Workspace> {
    const all = await this.load();
    const target = all.find((w) => w.id === id);
    if (!target) throw new Error(`workspace not found: ${id}`);

    if (patch.name !== undefined) {
      const next = patch.name.trim();
      if (!next) throw new Error("workspace name cannot be empty");
      target.name = next;
    }
    if (patch.description !== undefined) {
      target.description = patch.description.trim();
    }

    await this.persist(all);
    return { ...target };
  }

  async remove(id: string): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex((w) => w.id === id);
    if (idx === -1) return;
    if (all[idx].isDefault) {
      throw new Error("cannot remove default workspace");
    }
    all.splice(idx, 1);
    await this.persist(all);
  }

  private async load(): Promise<Workspace[]> {
    if (this.cache) return this.cache;

    if (!existsSync(this.options.filePath)) {
      const seeded = await this.seedDefault();
      this.cache = seeded;
      return seeded;
    }

    const raw = await readFile(this.options.filePath, "utf8");
    const parsed = JSON.parse(raw) as PersistedFile;
    const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];

    if (workspaces.length === 0) {
      const seeded = await this.seedDefault();
      this.cache = seeded;
      return seeded;
    }

    if (!workspaces.some((w) => w.isDefault)) {
      workspaces[0].isDefault = true;
      await this.persistRaw(workspaces);
    }

    this.cache = workspaces;
    return workspaces;
  }

  private async seedDefault(): Promise<Workspace[]> {
    await mkdir(this.options.defaultRootPath, { recursive: true });
    const def: Workspace = {
      id: this.generateId(),
      name: this.defaultName,
      description: this.defaultDescription,
      rootPath: this.options.defaultRootPath,
      createdAt: this.now(),
      isDefault: true,
    };
    const list = [def];
    await this.persistRaw(list);
    return list;
  }

  private async persist(workspaces: Workspace[]): Promise<void> {
    this.cache = workspaces;
    await this.persistRaw(workspaces);
  }

  private async persistRaw(workspaces: Workspace[]): Promise<void> {
    await mkdir(dirname(this.options.filePath), { recursive: true });
    const data: PersistedFile = { version: 1, workspaces };
    await writeFile(
      this.options.filePath,
      JSON.stringify(data, null, 2),
      "utf8",
    );
  }
}
