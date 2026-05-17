import { mkdir, readdir, stat, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { NetworkLogEntry, NetworkLogger } from "./NetworkLogger.ts";

export type FileNetworkLoggerOptions = {
  baseDir: string;
  maxFileBytes?: number;
  now?: () => Date;
  filePrefix?: string;
};

const DEFAULT_MAX_FILE_BYTES = 1 * 1024 * 1024;

export class FileNetworkLogger implements NetworkLogger {
  private readonly baseDir: string;
  private readonly maxFileBytes: number;
  private readonly now: () => Date;
  private readonly filePrefix: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: FileNetworkLoggerOptions) {
    this.baseDir = options.baseDir;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.now = options.now ?? (() => new Date());
    this.filePrefix = options.filePrefix ?? "network";
  }

  async log(entry: NetworkLogEntry): Promise<void> {
    const next = this.writeChain.then(() => this.writeEntry(entry));
    this.writeChain = next.catch(() => {});
    return next;
  }

  private async writeEntry(entry: NetworkLogEntry): Promise<void> {
    const date = this.now();
    const dayDir = join(this.baseDir, formatDay(date));
    await mkdir(dayDir, { recursive: true });

    const line = JSON.stringify(entry) + "\n";
    const lineBytes = Buffer.byteLength(line, "utf-8");
    const target = await this.resolveTarget(dayDir, lineBytes);
    await appendFile(target, line, "utf-8");
  }

  private async resolveTarget(dayDir: string, lineBytes: number): Promise<string> {
    const entries = await listLogFiles(dayDir, this.filePrefix);
    if (entries.length === 0) {
      return join(dayDir, formatFileName(this.filePrefix, 1));
    }

    const latest = entries[entries.length - 1]!;
    let size = 0;
    try {
      size = (await stat(latest.path)).size;
    } catch {
      size = 0;
    }

    if (size > 0 && size + lineBytes > this.maxFileBytes) {
      return join(dayDir, formatFileName(this.filePrefix, latest.index + 1));
    }
    return latest.path;
  }
}

function formatDay(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFileName(prefix: string, index: number): string {
  return `${prefix}-${index.toString().padStart(3, "0")}.jsonl`;
}

async function listLogFiles(
  dayDir: string,
  prefix: string,
): Promise<{ path: string; index: number }[]> {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)\\.jsonl$`);
  let files: string[] = [];
  try {
    files = await readdir(dayDir);
  } catch {
    return [];
  }
  const matched: { path: string; index: number }[] = [];
  for (const file of files) {
    const m = pattern.exec(file);
    if (!m) continue;
    matched.push({ path: join(dayDir, file), index: parseInt(m[1]!, 10) });
  }
  matched.sort((a, b) => a.index - b.index);
  return matched;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
