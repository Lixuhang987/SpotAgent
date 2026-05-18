import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BlobRecord } from "./BlobRecord.ts";
import type { BlobStore } from "./BlobStore.ts";

type FilesystemBlobStoreOptions = {
  rootPath?: string;
  now?: () => Date;
  idFactory?: () => string;
};

export class FilesystemBlobStore implements BlobStore {
  private readonly rootPath: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: FilesystemBlobStoreOptions = {}) {
    this.rootPath = options.rootPath ?? join(homedir(), ".spotAgent", "blobs");
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async put(input: { kind: string; bytes: Buffer; extension: string }): Promise<BlobRecord> {
    const rawId = this.idFactory();
    const id = `blob-${rawId}`;
    const date = this.now().toISOString().slice(0, 10);
    const dir = join(this.rootPath, date);
    await mkdir(dir, { recursive: true });

    const extension = normalizeExtension(input.extension);
    const contentPath = join(dir, `${rawId}.${extension}`);
    const record: BlobRecord = {
      id,
      kind: input.kind,
      size: input.bytes.byteLength,
      path: contentPath,
    };

    await writeFile(contentPath, input.bytes);
    await writeRecord(join(dir, `${rawId}.meta.json`), record);
    return record;
  }

  async get(id: string): Promise<BlobRecord | undefined> {
    const metaPath = await this.findMetaPath(id);
    if (!metaPath) return undefined;
    return readRecord(metaPath);
  }

  async readContent(id: string): Promise<Buffer> {
    const record = await this.get(id);
    if (!record) {
      throw new Error(`Blob not found: ${id}`);
    }
    return readFile(record.path);
  }

  async setSummary(id: string, summary: string): Promise<void> {
    const metaPath = await this.findMetaPath(id);
    if (!metaPath) {
      throw new Error(`Blob not found: ${id}`);
    }
    const record = await readRecord(metaPath);
    await writeRecord(metaPath, { ...record, summary });
  }

  private async findMetaPath(id: string): Promise<string | undefined> {
    const rawId = stripBlobPrefix(id);
    if (!existsSync(this.rootPath)) return undefined;

    const entries = await readdir(this.rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = join(this.rootPath, entry.name, `${rawId}.meta.json`);
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  }
}

function normalizeExtension(value: string): string {
  const normalized = value.replace(/^\./, "").trim();
  return /^[A-Za-z0-9]+$/.test(normalized) ? normalized : "bin";
}

function stripBlobPrefix(id: string): string {
  return id.startsWith("blob-") ? id.slice("blob-".length) : id;
}

async function readRecord(path: string): Promise<BlobRecord> {
  return JSON.parse(await readFile(path, "utf8")) as BlobRecord;
}

async function writeRecord(path: string, record: BlobRecord): Promise<void> {
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}
