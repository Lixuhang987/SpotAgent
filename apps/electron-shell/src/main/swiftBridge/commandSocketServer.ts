import { existsSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";

export class CommandSocketServer {
  private buffer = "";
  private listeners = new Set<(line: string) => void>();
  private server: Server | null = null;

  constructor(private readonly socketPath: string) {}

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.server) {
      return Promise.resolve();
    }

    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    this.server = createServer((socket) => this.handleSocket(socket));
    return new Promise((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.socketPath, () => {
        this.server?.off("error", reject);
        resolve();
      });
    });
  }

  close(): void {
    this.server?.close();
    this.server = null;
    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }
  }

  private handleSocket(socket: Socket): void {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this.receive(chunk.toString()));
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      for (const listener of this.listeners) {
        listener(line);
      }
    }
  }
}
