import { describe, expect, it } from "vitest";
import { AgentSession } from "../../src/runtime/AgentSession";
import {
  normalizeSelectedText,
  selectionResultFromText,
  type SelectionCapture,
  type SelectionCaptureResult,
} from "../../src/selection/SelectionCapture";

class FakeSelectionCapture implements SelectionCapture {
  constructor(private readonly value: SelectionCaptureResult) {}

  async captureSelectedText(): Promise<SelectionCaptureResult> {
    return this.value;
  }
}

describe("selection capture", () => {
  it("normalizes empty selections to null", () => {
    expect(normalizeSelectedText("")).toBeNull();
    expect(normalizeSelectedText("   ")).toBeNull();
    expect(normalizeSelectedText("a\r\nb")).toBe("a\nb");
  });

  it("maps selected text into a selected result", () => {
    expect(selectionResultFromText("用户刚刚选中的文本")).toEqual({
      kind: "selected",
      text: "用户刚刚选中的文本",
    });
  });

  it("maps empty selections into an empty result", () => {
    expect(selectionResultFromText("   ")).toEqual({
      kind: "empty",
    });
  });

  it("captures selected text through the interface", async () => {
    const capture = new FakeSelectionCapture({
      kind: "selected",
      text: "用户刚刚选中的文本",
    });

    await expect(capture.captureSelectedText()).resolves.toEqual({
      kind: "selected",
      text: "用户刚刚选中的文本",
    });
  });

  it("builds the initial session input with user-selected text", async () => {
    const session = await AgentSession.open({
      prompt: "总结重点",
      selection: {
        kind: "selected",
        text: "这是用户主动选中的一段文字",
      },
    });

    expect(session.selectedText).toBe("这是用户主动选中的一段文字");
    expect(session.buildInitialUserMessage()).toContain("这是用户主动选中的一段文字");
    expect(session.buildInitialUserMessage()).toContain("总结重点");
  });

  it("keeps prompt-only sessions when no selection is available", async () => {
    const session = await AgentSession.open({
      prompt: "直接执行",
      selection: {
        kind: "empty",
      },
    });

    expect(session.selectedText).toBeNull();
    expect(session.buildInitialUserMessage()).toBe("直接执行");
  });

  it("keeps prompt-only sessions when selection is omitted", async () => {
    const session = await AgentSession.open({
      prompt: "只执行提示词",
    });

    expect(session.selectedText).toBeNull();
    expect(session.buildInitialUserMessage()).toBe("只执行提示词");
  });
});
