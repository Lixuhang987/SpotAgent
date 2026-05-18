import { describe, expect, it } from "vitest";
import {
  parseStub,
  renderStub,
  type StubRecord,
} from "../src/runtime/Stub";

describe("Stub", () => {
  it("renders and parses an image stub with an empty body", () => {
    const stub: StubRecord = {
      id: "blob-image",
      kind: "image",
      size: 234567,
      path: "/tmp/blob.png",
    };

    const rendered = renderStub(stub);

    expect(rendered).toBe(
      '[STUB id=blob-image kind=image size=234567 path="/tmp/blob.png"]\n[/STUB]',
    );
    expect(parseStub(rendered)).toEqual({ ...stub, body: "" });
  });

  it("renders cached persist tool output with the complete body", () => {
    const stub: StubRecord = {
      id: "blob-tool",
      kind: "tool_result",
      cached: "persist",
      size: 12,
      path: "/tmp/blob.txt",
      body: "完整内容\n第二行",
    };

    const rendered = renderStub(stub);

    expect(rendered).toBe(
      '[STUB id=blob-tool kind=tool_result cached=persist size=12 path="/tmp/blob.txt"]\n完整内容\n第二行\n[/STUB]',
    );
    expect(parseStub(rendered)).toEqual(stub);
  });

  it("renders summarized turn tool output", () => {
    const stub: StubRecord = {
      id: "blob-turn",
      kind: "tool_result",
      cached: "turn",
      summarized: true,
      size: 98,
      path: "/tmp/blob.txt",
      body: "摘要保留了关键错误信息。",
    };

    const rendered = renderStub(stub);

    expect(rendered).toBe(
      '[STUB id=blob-turn kind=tool_result cached=turn summarized=true size=98 path="/tmp/blob.txt"]\n摘要保留了关键错误信息。\n[/STUB]',
    );
    expect(parseStub(rendered)).toEqual(stub);
  });
});
