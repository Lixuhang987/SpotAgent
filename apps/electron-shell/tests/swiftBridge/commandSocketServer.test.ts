import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { describe, expect, it } from "vitest";
import { CommandSocketServer } from "../../src/main/swiftBridge/commandSocketServer.js";

describe("CommandSocketServer", () => {
  it("receives newline-delimited commands from socket clients", async () => {
    const directory = mkdtempSync(join(tmpdir(), "handagent-command-socket-"));
    const socketPath = join(directory, "electron.sock");
    const server = new CommandSocketServer(socketPath);
    const received: string[] = [];
    server.onLine((line) => received.push(line));

    await server.start();
    try {
      await writeSocket(socketPath, "{\"a\"");
      await writeSocket(socketPath, ":1}\n{\"b\":2}\n");

      expect(received).toEqual(["{\"a\":1}", "{\"b\":2}"]);
    } finally {
      server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function writeSocket(socketPath: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.end(value, "utf8");
    });
    socket.on("close", () => resolve());
  });
}
