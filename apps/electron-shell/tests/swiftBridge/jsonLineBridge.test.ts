import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonLineBridge } from "../../src/main/swiftBridge/jsonLineBridge.js";

describe("JsonLineBridge", () => {
  it("parses newline-delimited commands split across chunks", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const received: string[] = [];
    const bridge = new JsonLineBridge({ input, output });
    bridge.onLine((line) => received.push(line));

    input.write("{\"a\"");
    input.write(":1}\n{\"b\":2}\n");

    expect(received).toEqual(["{\"a\":1}", "{\"b\":2}"]);
  });

  it("writes one JSON line per event", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const written: string[] = [];
    output.on("data", (chunk) => written.push(chunk.toString("utf8")));
    const bridge = new JsonLineBridge({ input, output });

    bridge.send({
      channel: "electron_shell",
      type: "electron.ready",
      timestamp: "2026-06-08T00:00:00.000Z",
    });

    expect(written.join("")).toBe(
      "{\"channel\":\"electron_shell\",\"type\":\"electron.ready\",\"timestamp\":\"2026-06-08T00:00:00.000Z\"}\n",
    );
  });
});
