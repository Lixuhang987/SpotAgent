import type { BlobRecord } from "@handagent/core/blob/BlobRecord.ts";
import type { BlobStore } from "@handagent/core/blob/BlobStore.ts";

export class MemoryBlobStore implements BlobStore {
  records: BlobRecord[] = [];
  contents = new Map<string, Buffer>();

  async put(input: { kind: string; bytes: Buffer; extension: string }): Promise<BlobRecord> {
    const id = `blob-${this.records.length + 1}`;
    const record: BlobRecord = {
      id,
      kind: input.kind,
      size: input.bytes.byteLength,
      path: `/tmp/${id}.${input.extension}`,
    };
    this.records.push(record);
    this.contents.set(id, input.bytes);
    return record;
  }

  async get(id: string): Promise<BlobRecord | undefined> {
    return this.records.find((record) => record.id === id);
  }

  async readContent(id: string): Promise<Buffer> {
    const content = this.contents.get(id);
    if (!content) throw new Error(`Blob not found: ${id}`);
    return content;
  }

  async setSummary(id: string, summary: string): Promise<void> {
    const record = await this.get(id);
    if (record) record.summary = summary;
  }
}
