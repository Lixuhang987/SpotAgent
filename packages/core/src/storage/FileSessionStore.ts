import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { SessionEvent, PersistedSession } from "./SessionRecord.ts";
import type {
  SessionStore,
  SessionSummary,
  CreateSessionInput,
} from "./SessionStore.ts";

export class FileSessionStore implements SessionStore {
  constructor(private readonly dir: string) {}

  async create(input: CreateSessionInput): Promise<PersistedSession> {
    await this.ensureDir();
    const now = input.createdAt ?? new Date().toISOString();
    const session: PersistedSession = {
      version: 1,
      metadata: {
        id: input.id,
        title: input.title ?? null,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        workspaceId: input.workspaceId ?? null,
        actionBinding: input.actionBinding,
      },
      messages: [],
      events: [],
    };
    await this.write(input.id, session);
    return session;
  }

  async get(sessionId: string): Promise<PersistedSession | null> {
    try {
      const raw = await readFile(this.path(sessionId), "utf-8");
      return JSON.parse(raw) as PersistedSession;
    } catch {
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    try {
      await unlink(this.path(sessionId));
    } catch {
      // already gone
    }
  }

  async list(): Promise<SessionSummary[]> {
    await this.ensureDir();
    const files = await readdir(this.dir);
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.dir, file), "utf-8");
        const session = JSON.parse(raw) as PersistedSession;
        summaries.push({ ...session.metadata });
      } catch {
        // skip corrupted files
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;
    session.metadata.title = title;
    await this.write(sessionId, session);
  }

  async appendMessages(
    sessionId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;
    session.messages.push(...messages);
    session.metadata.messageCount = session.messages.length;
    session.metadata.updatedAt = updatedAt;
    await this.write(sessionId, session);
  }

  async setMessages(
    sessionId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;
    session.messages = messages;
    session.metadata.messageCount = messages.length;
    session.metadata.updatedAt = updatedAt;
    await this.write(sessionId, session);
  }

  async appendEvents(
    sessionId: string,
    events: SessionEvent[],
  ): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;
    session.events.push(...events);
    await this.write(sessionId, session);
  }

  private path(sessionId: string): string {
    return join(this.dir, `${sessionId}.json`);
  }

  private async write(sessionId: string, session: PersistedSession): Promise<void> {
    await this.ensureDir();
    await writeFile(this.path(sessionId), JSON.stringify(session, null, 2), "utf-8");
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }
}
