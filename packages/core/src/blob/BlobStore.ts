import type { BlobRecord } from "./BlobRecord.ts";

export interface BlobStore {
  put(input: { kind: string; bytes: Buffer; extension: string }): Promise<BlobRecord>;
  get(id: string): Promise<BlobRecord | undefined>;
  readContent(id: string): Promise<Buffer>;
  setSummary(id: string, summary: string): Promise<void>;
}
