import { describe, expect, it, vi } from "vitest";
import type { BlobRecord } from "../src/blob/BlobRecord";
import type { BlobStore } from "../src/blob/BlobStore";
import type { LLMClient } from "../src/llm/LLMClient";
import type { AgentMessage } from "../src/runtime/AgentMessage";
import { renderStub } from "../src/runtime/Stub";
import { TurnSummarizer } from "../src/runtime/TurnSummarizer";

class MemoryBlobStore implements BlobStore {
  records = new Map<string, BlobRecord>();
  contents = new Map<string, Buffer>();

  seed(record: BlobRecord, content: string): void {
    this.records.set(record.id, record);
    this.contents.set(record.id, Buffer.from(content, "utf8"));
  }

  async put(input: { kind: string; bytes: Buffer; extension: string }): Promise<BlobRecord> {
    const id = `blob-${this.records.size + 1}`;
    const record = {
      id,
      kind: input.kind,
      size: input.bytes.byteLength,
      path: `/tmp/${id}.${input.extension}`,
    };
    this.seed(record, input.bytes.toString("utf8"));
    return record;
  }

  async get(id: string): Promise<BlobRecord | undefined> {
    return this.records.get(id);
  }

  async readContent(id: string): Promise<Buffer> {
    const content = this.contents.get(id);
    if (!content) throw new Error(`Blob not found: ${id}`);
    return content;
  }

  async setSummary(id: string, summary: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) throw new Error(`Blob not found: ${id}`);
    this.records.set(id, { ...record, summary });
  }
}

describe("TurnSummarizer", () => {
  it("writes summaries to the blob store and rewrites turn-cached tool messages", async () => {
    const blobStore = new MemoryBlobStore();
    const fullBody = "src/app.ts:10 报错 Cannot read property 'x'";
    const record = {
      id: "blob-1",
      kind: "tool_result",
      size: Buffer.byteLength(fullBody, "utf8"),
      path: "/tmp/blob-1.txt",
    };
    blobStore.seed(record, fullBody);
    const messages: AgentMessage[] = [
      {
        role: "tool",
        toolCallId: "call-1",
        name: "file.read",
        content: renderStub({
          ...record,
          cached: "turn",
          body: fullBody,
        }),
        blob: { id: "blob-1", cached: "turn" },
      },
    ];
    const client: LLMClient = {
      async complete(summaryMessages) {
        expect(summaryMessages.at(-1)?.content).toContain(fullBody);
        return {
          message: {
            role: "assistant",
            content: "src/app.ts:10 有 Cannot read property 'x' 错误。",
          },
          toolCalls: [],
        };
      },
    };

    await new TurnSummarizer({ client, blobStore }).summarizeTurn(messages);

    await expect(blobStore.get("blob-1")).resolves.toMatchObject({
      summary: "src/app.ts:10 有 Cannot read property 'x' 错误。",
    });
    expect(messages[0]).toEqual({
      role: "tool",
      toolCallId: "call-1",
      name: "file.read",
      content:
        `[STUB id=blob-1 kind=tool_result cached=turn summarized=true size=${Buffer.byteLength(fullBody, "utf8")} path="/tmp/blob-1.txt"]\n` +
        "src/app.ts:10 有 Cannot read property 'x' 错误。\n" +
        "[/STUB]",
      blob: { id: "blob-1", cached: "turn", summarized: true },
    });
  });

  it("keeps full body after a failed summary and retries later", async () => {
    const blobStore = new MemoryBlobStore();
    const fullBody = "第一轮完整内容";
    const record = {
      id: "blob-1",
      kind: "tool_result",
      size: Buffer.byteLength(fullBody, "utf8"),
      path: "/tmp/blob-1.txt",
    };
    blobStore.seed(record, fullBody);
    const messages: AgentMessage[] = [
      {
        role: "tool",
        toolCallId: "call-1",
        name: "file.read",
        content: renderStub({ ...record, cached: "turn", body: fullBody }),
        blob: { id: "blob-1", cached: "turn" },
      },
    ];
    const warn = vi.fn();
    let attempts = 0;
    const client: LLMClient = {
      async complete() {
        attempts += 1;
        if (attempts === 1) throw new Error("summary failed");
        return {
          message: { role: "assistant", content: "重试后摘要。" },
          toolCalls: [],
        };
      },
    };
    const summarizer = new TurnSummarizer({ client, blobStore, warn });

    await summarizer.summarizeTurn(messages);

    expect(warn).toHaveBeenCalledWith(
      "Failed to summarize tool result blob-1: summary failed",
    );
    expect(messages[0].content).toContain(fullBody);
    expect(messages[0].blob).toEqual({ id: "blob-1", cached: "turn" });

    await summarizer.summarizeTurn(messages);

    expect(messages[0].content).toContain("summarized=true");
    expect(messages[0].content).toContain("重试后摘要。");
    await expect(blobStore.get("blob-1")).resolves.toMatchObject({
      summary: "重试后摘要。",
    });
  });
});
