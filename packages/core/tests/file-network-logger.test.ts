import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileNetworkLogger } from "../src/logging/FileNetworkLogger";

describe("FileNetworkLogger", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "handagent-network-log-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("writes one JSONL line per entry under a date folder", async () => {
    const fixedDate = new Date("2026-05-17T08:30:00Z");
    const logger = new FileNetworkLogger({ baseDir, now: () => fixedDate });

    await logger.log({
      timestamp: fixedDate.toISOString(),
      direction: "request",
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      body: { model: "gpt-5-mini" },
    });
    await logger.log({
      timestamp: fixedDate.toISOString(),
      direction: "response",
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      status: 200,
      body: { id: "chatcmpl-1" },
    });

    const day = formatDay(fixedDate);
    const dayDir = join(baseDir, day);
    const files = await readdir(dayDir);
    expect(files).toEqual(["network-001.jsonl"]);

    const content = await readFile(join(dayDir, "network-001.jsonl"), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({
      timestamp: fixedDate.toISOString(),
      direction: "request",
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      body: { model: "gpt-5-mini" },
    });
    expect(JSON.parse(lines[1]!).direction).toBe("response");
  });

  it("rotates to a new file when the current file would exceed maxFileBytes", async () => {
    const fixedDate = new Date("2026-05-17T08:30:00Z");
    const logger = new FileNetworkLogger({
      baseDir,
      now: () => fixedDate,
      maxFileBytes: 200,
    });

    const longBody = { payload: "x".repeat(150) };
    await logger.log({
      timestamp: fixedDate.toISOString(),
      direction: "request",
      url: "https://api.example.com",
      method: "POST",
      body: longBody,
    });
    await logger.log({
      timestamp: fixedDate.toISOString(),
      direction: "response",
      url: "https://api.example.com",
      method: "POST",
      status: 200,
      body: longBody,
    });

    const day = formatDay(fixedDate);
    const files = (await readdir(join(baseDir, day))).sort();
    expect(files).toEqual(["network-001.jsonl", "network-002.jsonl"]);
  });

  it("splits log files across separate folders for separate days", async () => {
    let date = new Date(2026, 4, 17, 12, 0, 0);
    const logger = new FileNetworkLogger({ baseDir, now: () => date });

    await logger.log({
      timestamp: date.toISOString(),
      direction: "request",
      url: "https://api.example.com",
      method: "POST",
      body: { day: 1 },
    });

    date = new Date(2026, 4, 18, 12, 0, 0);
    await logger.log({
      timestamp: date.toISOString(),
      direction: "request",
      url: "https://api.example.com",
      method: "POST",
      body: { day: 2 },
    });

    const dirs = (await readdir(baseDir)).sort();
    expect(dirs).toEqual(["2026-05-17", "2026-05-18"]);
  });
});

function formatDay(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}
