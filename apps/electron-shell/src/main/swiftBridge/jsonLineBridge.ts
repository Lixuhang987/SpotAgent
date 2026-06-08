import type { Readable, Writable } from "node:stream";

export class JsonLineBridge {
  private buffer = "";
  private listeners = new Set<(line: string) => void>();

  constructor(private readonly streams: { input: Readable; output: Writable }) {
    streams.input.setEncoding("utf8");
    streams.input.on("data", (chunk: string) => this.receive(chunk));
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(value: unknown): void {
    this.streams.output.write(`${JSON.stringify(value)}\n`);
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
