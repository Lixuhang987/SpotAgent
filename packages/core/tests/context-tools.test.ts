import { describe, expect, it } from "vitest";
import type {
  AccessibilityActionRequest,
  AccessibilityActionResult,
  AccessibilityNodeSnapshot,
  AccessibilitySnapshotTarget,
  OCRRequest,
  OCRResult,
  PlatformAdapter,
  ScreenCaptureRequest,
  ScreenCaptureResult,
} from "../src/platform/PlatformAdapter";
import { AccessibilityActionTool } from "../src/tools/builtins/AccessibilityActionTool";
import { AccessibilitySnapshotTool } from "../src/tools/builtins/AccessibilitySnapshotTool";
import { OCRTool } from "../src/tools/builtins/OCRTool";
import { ScreenCaptureTool } from "../src/tools/builtins/ScreenCaptureTool";
import { ToolRegistry } from "../src/tools/ToolRegistry";

class FakePlatformAdapter implements PlatformAdapter {
  async currentClipboardText(): Promise<string | null> {
    return null;
  }

  async frontmostAppInfo() {
    return {
      name: "Preview",
      resolution: "best_effort" as const,
    };
  }

  async frontmostWindowList() {
    return [
      {
        title: "Example",
        appName: "Preview",
      },
    ];
  }

  async captureScreen(request: ScreenCaptureRequest): Promise<ScreenCaptureResult> {
    return {
      imageBase64: "ZmFrZS1wbmc=",
      mimeType: "image/png",
      width: 1440,
      height: 900,
      target: request.target,
      resolution: "best_effort",
    };
  }

  async recognizeText(request: OCRRequest): Promise<OCRResult> {
    return {
      text: `ocr:${request.imageBase64.slice(0, 4)}`,
      lines: [
        {
          text: "Hello",
          confidence: 0.99,
        },
      ],
      resolution: "best_effort",
    };
  }

  async accessibilitySnapshot(target: AccessibilitySnapshotTarget): Promise<AccessibilityNodeSnapshot> {
    return {
      role: "window",
      label: "Main Window",
      target,
      children: [
        {
          role: "button",
          label: "Confirm",
          target,
          children: [],
        },
      ],
      resolution: "best_effort",
    };
  }

  async performAccessibilityAction(request: AccessibilityActionRequest): Promise<AccessibilityActionResult> {
    return {
      ok: true,
      target: request.target,
      action: request.action,
      resolution: "best_effort",
    };
  }
}

describe("context tools", () => {
  it("registers task 6 tool schemas", () => {
    const platform = new FakePlatformAdapter();
    const registry = new ToolRegistry([
      new ScreenCaptureTool(platform),
      new OCRTool(platform),
      new AccessibilitySnapshotTool(platform),
      new AccessibilityActionTool(platform),
    ]);

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "screen.capture",
      "ocr.read",
      "accessibility.snapshot",
      "accessibility.action",
    ]);
  });

  it("delegates calls to the platform adapter", async () => {
    const platform = new FakePlatformAdapter();

    const screenshot = await new ScreenCaptureTool(platform).call({
      target: { kind: "display", displayId: "main" },
    });
    const ocr = await new OCRTool(platform).call({
      imageBase64: "ZmFrZS1pbWFnZQ==",
    });
    const snapshot = await new AccessibilitySnapshotTool(platform).call({
      kind: "frontmost_app",
    });
    const action = await new AccessibilityActionTool(platform).call({
      target: { kind: "element", elementId: "confirm-button" },
      action: { kind: "press" },
    });

    expect(screenshot).toMatchObject({
      mimeType: "image/png",
      target: { kind: "display", displayId: "main" },
    });
    expect(ocr).toMatchObject({
      text: "ocr:ZmFr",
    });
    expect(snapshot).toMatchObject({
      role: "window",
      children: [{ role: "button", label: "Confirm" }],
    });
    expect(action).toEqual({
      ok: true,
      target: { kind: "element", elementId: "confirm-button" },
      action: { kind: "press" },
      resolution: "best_effort",
    });
  });
});
